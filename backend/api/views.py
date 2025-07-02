from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.contrib.auth import get_user_model
from django.conf import settings
from django.http import HttpResponse
import json
import time
import logging

from .templates import ACTIVITY_TEMPLATES, get_template_by_id
from .gemini_service import GeminiAnalysisService
from .analytics import analytics
from .realtime_coaching import RealtimeCoachingService
from .elevenlabs_service import ElevenLabsService

User = get_user_model()

logger = logging.getLogger(__name__)

# Create a single coaching service instance that persists across requests
COACHING_SERVICE = RealtimeCoachingService()

@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    """Health check endpoint"""
    return Response({'status': 'healthy', 'message': 'Motion Mentor API is running'})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_templates(request):
    """Get all activity templates"""
    category = request.GET.get('category')
    
    templates = ACTIVITY_TEMPLATES
    if category:
        templates = [t for t in templates if t['category'] == category]
    
    return Response({
        'templates': templates,
        'total': len(templates)
    })

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_limits(request):
    """Get user's current rate limits and usage"""
    user = request.user
    user.reset_daily_count_if_needed()
    user.reset_hourly_count_if_needed()
    
    can_analyze, message = user.can_analyze()
    
    # Track rate limit check if user is near limits
    if not can_analyze:
        analytics.track_rate_limit(
            user_id=str(user.id),
            limit_type='combined',
            current_usage=max(user.analyses_today, user.analyses_this_hour),
            limit=min(settings.RATE_LIMIT_ANALYSES_PER_DAY, settings.RATE_LIMIT_ANALYSES_PER_HOUR)
        )
    
    return Response({
        'can_analyze': can_analyze,
        'message': message,
        'limits': {
            'daily_limit': settings.RATE_LIMIT_ANALYSES_PER_DAY,
            'hourly_limit': settings.RATE_LIMIT_ANALYSES_PER_HOUR,
            'daily_used': user.analyses_today,
            'hourly_used': user.analyses_this_hour,
            'daily_remaining': max(0, settings.RATE_LIMIT_ANALYSES_PER_DAY - user.analyses_today),
            'hourly_remaining': max(0, settings.RATE_LIMIT_ANALYSES_PER_HOUR - user.analyses_this_hour),
        },
        'last_analysis': user.last_analysis,
        'account_status': 'active' if not user.is_banned else 'banned',
        'rate_limiting_enabled': getattr(settings, 'RATE_LIMITING_ENABLED', True)
    })

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
def analyze_video(request):
    """Analyze video with AI feedback"""
    user = request.user
    start_time = time.time()
    
    # Check rate limits (middleware already checked, but double-check)
    can_analyze, message = user.can_analyze()
    if not can_analyze:
        # Track rate limit hits
        analytics.track_rate_limit(
            user_id=str(user.id),
            limit_type='analysis_request',
            current_usage=max(user.analyses_today, user.analyses_this_hour),
            limit=min(settings.RATE_LIMIT_ANALYSES_PER_DAY, settings.RATE_LIMIT_ANALYSES_PER_HOUR)
        )
        
        return Response({
            'error': 'Rate limit exceeded',
            'message': message
        }, status=status.HTTP_429_TOO_MANY_REQUESTS)
    
    # Check if we have coaching data (prioritize over video analysis)
    coaching_data_json = request.POST.get('coaching_data')
    has_coaching_data = bool(coaching_data_json)
    
    # Validate request data
    if 'video' not in request.FILES and not has_coaching_data:
        return Response({
            'error': 'No video file or coaching data provided'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    video_file = request.FILES.get('video') if 'video' in request.FILES else None
    template_id = request.POST.get('template_id')
    custom_prompt = request.POST.get('custom_prompt', '').strip()
    
    # Parse coaching data if available
    coaching_data = None
    if coaching_data_json:
        try:
            coaching_data = json.loads(coaching_data_json)
        except json.JSONDecodeError:
            return Response({
                'error': 'Invalid coaching data format'
            }, status=status.HTTP_400_BAD_REQUEST)
    
    # Determine prompt to use
    if template_id:
        template = get_template_by_id(template_id)
        if not template:
            return Response({
                'error': 'Invalid template ID'
            }, status=status.HTTP_400_BAD_REQUEST)
        prompt = template['prompt']
        analysis_type = f"Template: {template['name']}"
    elif custom_prompt:
        if len(custom_prompt) < 10:
            return Response({
                'error': 'Custom prompt must be at least 10 characters'
            }, status=status.HTTP_400_BAD_REQUEST)
        if len(custom_prompt) > 500:
            return Response({
                'error': 'Custom prompt must be less than 500 characters'
            }, status=status.HTTP_400_BAD_REQUEST)
        prompt = f"Analyze this video based on the following request: {custom_prompt}\n\nProvide specific, actionable feedback."
        analysis_type = "Custom Prompt"
    else:
        return Response({
            'error': 'Either template_id or custom_prompt must be provided'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    # Initialize Gemini service
    gemini_service = GeminiAnalysisService()
    
    # Validate video if provided
    if video_file:
        validation_result = gemini_service.validate_video(video_file)
        if not validation_result['valid']:
            return Response({
                'error': validation_result['error']
            }, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Track analysis request
        analytics.track_analysis_request(
            user_id=str(user.id),
            activity_type=analysis_type,
            template_id=template_id,
            video_size=video_file.size,
            custom_prompt=bool(custom_prompt)
        )
        
        # Record analysis attempt (before processing to prevent retry abuse)
        user.record_analysis()
        
        # Smart analysis: use coaching data if available, otherwise video
        if coaching_data:
            analysis_result = gemini_service.analyze_coaching_session(coaching_data, prompt)
        else:
            analysis_result = gemini_service.analyze_activity(video_file, prompt)
        
        processing_time = time.time() - start_time
        
        if analysis_result['success']:
            # Track successful analysis
            analytics.track_analysis_completion(
                user_id=str(user.id),
                activity_type=analysis_type,
                success=True,
                processing_time=processing_time,
                frames_analyzed=analysis_result.get('frames_analyzed', 0)
            )
            
            return Response({
                'success': True,
                'analysis': analysis_result['analysis'],
                'analysis_type': analysis_type,
                'frames_analyzed': analysis_result.get('frames_analyzed', 0),
                'remaining_analyses': {
                    'daily': max(0, settings.RATE_LIMIT_ANALYSES_PER_DAY - user.analyses_today),
                    'hourly': max(0, settings.RATE_LIMIT_ANALYSES_PER_HOUR - user.analyses_this_hour)
                }
            })
        else:
            # Track failed analysis
            analytics.track_analysis_completion(
                user_id=str(user.id),
                activity_type=analysis_type,
                success=False,
                processing_time=processing_time,
                error=analysis_result.get('error', 'Analysis failed')
            )
            
            # Analysis failed, but we already recorded the attempt
            # This prevents users from retrying failed analyses without counting against limits
            return Response({
                'success': False,
                'error': analysis_result.get('error', 'Analysis failed'),
                'analysis': analysis_result.get('analysis', 'Sorry, we could not analyze your video.')
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
    except Exception as e:
        processing_time = time.time() - start_time
        
        # Track exception
        analytics.track_error(
            error_type='analysis_exception',
            error_message=str(e),
            user_id=str(user.id),
            context={
                'activity_type': analysis_type if 'analysis_type' in locals() else 'unknown',
                'processing_time': processing_time,
                'video_size': video_file.size if 'video_file' in locals() else None
            }
        )
        
        return Response({
            'success': False,
            'error': f'Analysis failed: {str(e)}',
            'analysis': 'Sorry, an unexpected error occurred. Please try again.'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([AllowAny])
def verify_google_token(request):
    """Verify Google OAuth token and return user info (used by frontend)"""
    try:
        # The authentication is handled by GoogleTokenAuthentication
        # This endpoint is mainly for testing token validity
        return Response({
            'valid': True,
            'message': 'Token is valid'
        })
    except Exception as e:
        return Response({
            'valid': False,
            'error': str(e)
        }, status=status.HTTP_401_UNAUTHORIZED)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
def realtime_coaching(request):
    """Real-time coaching analysis for live feedback"""
    import asyncio
    
    try:
        data = json.loads(request.body)
        frame_data = data.get('frame_data')
        activity_type = data.get('activity_type')  # Frontend sends activity_type
        pose_data = data.get('pose_data', {})
        
        if not frame_data or not activity_type:
            return Response({
                'success': False,
                'error': 'Missing frame_data or activity_type'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Build context from request data
        context = {
            'user_id': str(request.user.id),
            'timestamp': pose_data.get('timestamp', int(time.time() * 1000)),
            'pose_data': pose_data
        }
        
        # Initialize coaching service
        coaching_service = COACHING_SERVICE
        
        # Check if we should analyze this frame (avoid spam)
        user_id = context['user_id']
        current_time = context['timestamp']
        
        if not coaching_service.should_analyze_frame(user_id, current_time):
            return Response({
                'success': False,
                'message': 'Analysis skipped - too frequent'
            })
        
        # Analyze the frame using asyncio.run for async compatibility
        result = asyncio.run(coaching_service.analyze_live_frame(frame_data, activity_type, context))
        
        if result['success']:
            # Track coaching interaction
            analytics.track_coaching_feedback(
                user_id=user_id,
                activity_type=activity_type,
                feedback_type=result.get('type', 'tip'),
                feedback_length=len(result.get('feedback', ''))
            )
        
        return Response(result)
        
    except json.JSONDecodeError:
        return Response({
            'success': False,
            'error': 'Invalid JSON data'
        }, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
                 return Response({
             'success': False,
             'error': str(e)
         }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
def generate_speech(request):
    """Generate high-quality speech using ElevenLabs for coaching feedback"""
    try:
        data = json.loads(request.body)
        text = data.get('text', '').strip()
        activity_name = data.get('activity_name', '')
        feedback_type = data.get('feedback_type', 'tip')
        
        if not text:
            return Response({
                'success': False,
                'error': 'Text is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Initialize ElevenLabs service
        elevenlabs_service = ElevenLabsService()
        
        if not elevenlabs_service.is_available():
            return Response({
                'success': False,
                'error': 'ElevenLabs service not available - API key not configured',
                'fallback': True,  # Frontend should use browser speech
                'message': 'Using browser speech synthesis instead'
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        
        # Generate speech audio
        audio_bytes = elevenlabs_service.create_coaching_audio(
            feedback_text=text,
            activity_name=activity_name,
            feedback_type=feedback_type
        )
        
        if audio_bytes:
            # Track speech generation
            analytics.track_event('speech_generated', str(request.user.id), {
                'activity_name': activity_name,
                'feedback_type': feedback_type,
                'text_length': len(text),
                'audio_size': len(audio_bytes)
            })
            
            # Return audio as MP3
            response = HttpResponse(audio_bytes, content_type='audio/mpeg')
            response['Content-Disposition'] = 'inline; filename="coaching_audio.mp3"'
            response['Cache-Control'] = 'max-age=300'  # Cache for 5 minutes
            return response
        else:
            return Response({
                'success': False,
                'error': 'Failed to generate speech',
                'fallback': True
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
    except json.JSONDecodeError:
        return Response({
            'success': False,
            'error': 'Invalid JSON data'
        }, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({
            'success': False,
            'error': str(e),
            'fallback': True
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
def analyze_complete_rep(request):
    """Analyze a complete rep after it's finished for expert coaching feedback"""
    try:
        data = json.loads(request.body)
        activity_type = data.get('activity_type')
        rep_data = data.get('rep_data', {})
        user_context = data.get('user_context', {})
        
        if not activity_type or not rep_data:
            return Response({
                'success': False,
                'error': 'Missing activity_type or rep_data'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Initialize coaching service
        coaching_service = COACHING_SERVICE
        
        # Create complete rep coaching feedback
        feedback = coaching_service.analyze_complete_rep(
            activity_type=activity_type,
            rep_data=rep_data,
            user_context=user_context
        )
        
        if feedback:
            # Track rep analysis
            analytics.track_event('rep_analyzed', str(request.user.id), {
                'activity_type': activity_type,
                'rep_number': rep_data.get('number', 0),
                'form_score': rep_data.get('formScore', 0),
                'feedback_length': len(feedback)
            })
            
            return Response({
                'success': True,
                'feedback': feedback
            })
        else:
            return Response({
                'success': False,
                'error': 'No feedback generated'
            })
            
    except json.JSONDecodeError:
        return Response({
            'success': False,
            'error': 'Invalid JSON data'
        }, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({
            'success': False,
            'error': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
def start_live_coaching(request):
    """Start a live coaching session for continuous analysis"""
    user = request.user
    
    # Check rate limits
    can_analyze, message = user.can_analyze()
    if not can_analyze:
        return Response({
            'error': 'Rate limit exceeded',
            'message': message
        }, status=status.HTTP_429_TOO_MANY_REQUESTS)
    
    try:
        activity_type = request.data.get('activity_type', 'general')
        
        # Initialize live coaching service
        coaching_service = COACHING_SERVICE
        
        # Create or get user state
        user_state = coaching_service.get_user_state(str(user.id))
        user_state['phase'] = 'setup'
        user_state['rep_count'] = 0
        user_state['movement_detected'] = False
        
        # Track live coaching session start
        if analytics:
            analytics.track_analysis_request(
                user_id=str(user.id),
                activity_type=f"Live Coaching: {activity_type}",
                template_id=None,
                video_size=0,
                custom_prompt=False
            )
        
        return Response({
            'success': True,
            'message': 'Live coaching session started',
            'session_id': f"live_{user.id}_{int(time.time())}",
            'activity_type': activity_type,
            'user_state': user_state
        })
        
    except Exception as e:
        return Response({
            'error': 'Failed to start live coaching session',
            'message': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
def stop_live_coaching(request):
    """Stop a live coaching session"""
    user = request.user
    
    try:
        session_id = request.data.get('session_id')
        coaching_data = request.data.get('coaching_data', {})
        
        # Initialize coaching service
        coaching_service = COACHING_SERVICE
        
        # Reset user state
        coaching_service.reset_user_state(str(user.id))
        
        # Track session completion
        if analytics:
            analytics.track_analysis_completion(
                user_id=str(user.id),
                activity_type="Live Coaching Session",
                success=True,
                processing_time=0,
                frames_analyzed=coaching_data.get('total_reps', 0)
            )
        
        return Response({
            'success': True,
            'message': 'Live coaching session stopped',
            'session_summary': {
                'total_reps': coaching_data.get('total_reps', 0),
                'session_duration': coaching_data.get('duration', 0),
                'feedback_given': coaching_data.get('feedback_count', 0)
            }
        })
        
    except Exception as e:
        return Response({
            'error': 'Failed to stop live coaching session',
            'message': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
def analyze_live_frame(request):
    """Analyze a single frame for live coaching feedback with proper rep counting"""
    user = request.user
    
    try:
        # Get frame data
        frame_data = request.data.get('frame_data')
        activity_type = request.data.get('activity_type', 'general')
        pose_data = request.data.get('pose_data', {})
        current_time = request.data.get('timestamp', int(time.time() * 1000))
        
        if not frame_data and not pose_data:
            return Response({
                'error': 'No frame data or pose data provided'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Initialize coaching service
        coaching_service = COACHING_SERVICE
        
        # Get user state
        user_state = coaching_service.get_user_state(str(user.id))
        
        # Check for movement completion (squat, pushup, etc.)
        movement_completed = False
        if pose_data:
            movement_completed = coaching_service.detect_movement_completion(pose_data, activity_type)
        
        # Initialize response data
        response_data = {
            'should_provide_feedback': False,
            'movement_completed': movement_completed,
            'feedback': None,
            'rep_count': user_state.get('rep_count', 0),
            'phase': user_state.get('phase', 'monitoring'),
            'activity_type': activity_type
        }
        
        # If movement completed (squat finished, pushup completed, etc.)
        if movement_completed:
            # Increment rep count
            user_state['rep_count'] += 1
            user_state['last_feedback'] = current_time
            
            logger.info(f"Rep {user_state['rep_count']} completed for {activity_type}")
            
            # Generate AI feedback for this completed rep
            try:
                import asyncio
                
                # Create specific prompt for completed rep feedback
                rep_feedback_prompt = f"""
                You are an expert {activity_type} coach. The user just completed rep #{user_state['rep_count']}.
                
                Analyze their form in this completed rep and provide:
                - Brief (15-20 words) specific feedback on their technique
                - What they did well in this rep
                - One specific improvement for the next rep
                - Use an encouraging but corrective tone
                
                Focus on: depth, knee tracking, back position, and control for squats.
                Be specific about what you observed in THIS rep.
                
                Current rep: {user_state['rep_count']}
                Activity: {activity_type}
                """
                
                # Get AI coaching response for completed rep
                feedback = asyncio.run(
                    coaching_service.gemini_service.analyze_video_frame(
                        frame_data or "",
                        rep_feedback_prompt
                    )
                )
                
                if feedback and len(feedback.strip()) > 0:
                    response_data.update({
                        'should_provide_feedback': True,
                        'feedback': feedback,
                        'rep_count': user_state['rep_count'],
                        'feedback_type': 'rep_completed',
                        'movement_completed': True
                    })
                    
                    # Record analysis usage
                    user.record_analysis()
                    
                    logger.info(f"AI feedback provided for {activity_type} rep {user_state['rep_count']}")
                else:
                    # If AI fails, still count the rep but no feedback
                    logger.warning(f"AI feedback failed for {activity_type} rep {user_state['rep_count']}")
                    response_data.update({
                        'should_provide_feedback': False,
                        'rep_count': user_state['rep_count'],
                        'feedback_type': 'rep_completed',
                        'movement_completed': True,
                        'message': 'Rep counted, AI feedback unavailable'
                    })
                    
            except Exception as e:
                logger.error(f"Error generating rep feedback: {e}")
                # Still count the rep even if feedback fails
                response_data.update({
                    'should_provide_feedback': False,
                    'rep_count': user_state['rep_count'],
                    'feedback_type': 'rep_completed', 
                    'movement_completed': True,
                    'error': 'Rep counted, feedback generation failed'
                })
        
        else:
            # No movement completed - just monitoring
            response_data.update({
                'should_provide_feedback': False,
                'movement_completed': False,
                'rep_count': user_state['rep_count'],
                'feedback_type': 'monitoring',
                'message': 'Monitoring form, no rep completed'
            })
        
        return Response(response_data)
        
    except Exception as e:
        logger.error(f"Error in analyze_live_frame: {e}")
        return Response({
            'error': 'Failed to analyze live frame',
            'message': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
@csrf_exempt
def get_live_feedback(request):
    """Get continuous form feedback during live coaching - CONSOLIDATED to prevent overlapping speech"""
    user = request.user
    
    try:
        activity_type = request.data.get('activity_type', 'general')
        pose_data = request.data.get('pose_data', {})
        frame_data = request.data.get('frame_data', '')  # Get actual frame data
        current_time = request.data.get('timestamp', int(time.time() * 1000))
        
        # Initialize coaching service
        coaching_service = COACHING_SERVICE
        
        # Check if we should provide feedback (rate limiting to prevent overlap)
        if not coaching_service.should_provide_coaching(str(user.id), activity_type):
            return Response({
                'should_provide_feedback': False,
                'message': 'Feedback rate limited'
            })
        
        # Use the consolidated analyze_live_frame method to prevent timing conflicts
        try:
            import asyncio
            context = {
                'user_id': str(user.id),
                'timestamp': current_time,
                'pose_data': pose_data
            }
            
            # Use the same method as other endpoints to prevent conflicts
            result = asyncio.run(coaching_service.analyze_live_frame(frame_data, activity_type, context))
            
            if result.get('success') and result.get('feedback'):
                # Record analysis usage
                user.record_analysis()
                
                return Response({
                    'should_provide_feedback': True,
                    'feedback': result['feedback'],
                    'feedback_type': result.get('type', 'ai_analysis'),
                    'activity': result.get('activity', activity_type),
                    'rep_count': result.get('rep_count', 0)
                })
            else:
                return Response({
                    'should_provide_feedback': False,
                    'message': result.get('message', 'No feedback needed at this time')
                })
            
        except Exception as e:
            logger.error(f"Error in get_live_feedback: {e}")
            # NO FALLBACK FEEDBACK - return empty response
            return Response({
                'should_provide_feedback': False,
                'error': f'AI feedback failed: {str(e)}'
            })
        
    except Exception as e:
        logger.error(f"Error in get_live_feedback endpoint: {e}")
        return Response({
            'error': 'Failed to get live feedback',
            'message': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)