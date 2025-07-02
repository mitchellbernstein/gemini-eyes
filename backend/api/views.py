from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from django.contrib.auth import get_user_model
from django.conf import settings
import json
import time

from .templates import ACTIVITY_TEMPLATES, get_template_by_id
from .gemini_service import GeminiAnalysisService
from .analytics import analytics
from .realtime_coaching import RealtimeCoachingService
from .elevenlabs_service import ElevenLabsService

User = get_user_model()

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
    try:
        data = json.loads(request.body)
        frame_data = data.get('frame_data')
        activity_name = data.get('activity_name')
        context = data.get('context', {})
        
        if not frame_data or not activity_name:
            return Response({
                'success': False,
                'error': 'Missing frame_data or activity_name'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Initialize coaching service
        coaching_service = RealtimeCoachingService()
        
        # Check if we should analyze this frame (avoid spam)
        user_id = str(request.user.id)
        current_time = context.get('timestamp', int(time.time() * 1000))
        
        if not coaching_service.should_analyze_frame(user_id, current_time):
            return Response({
                'success': False,
                'message': 'Analysis skipped - too frequent'
            })
        
        # Analyze the frame
        result = coaching_service.analyze_live_frame(frame_data, activity_name, context)
        
        if result['success']:
            # Track coaching interaction
            analytics.track_coaching_feedback(
                user_id=user_id,
                activity_type=activity_name,
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