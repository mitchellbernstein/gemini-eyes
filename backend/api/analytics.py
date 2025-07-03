"""
OpenPanel Analytics Service for Motion Mentor Backend
"""

import os
from typing import Dict, Any, Optional
from django.conf import settings

try:
    from openpanel_py import OpenPanel
except ImportError:
    print("Warning: openpanel_py not available, analytics will be disabled")
    OpenPanel = None


class AnalyticsService:
    """Service for tracking backend analytics events with OpenPanel"""
    
    def __init__(self):
        self.client = None
        self._initialize_client()
    
    def _initialize_client(self):
        """Initialize OpenPanel client with environment variables"""
        try:
            if OpenPanel is None:
                print("OpenPanel not available - analytics disabled")
                return
                
            client_id = getattr(settings, 'OPENPANEL_CLIENT_ID', None)
            secret = getattr(settings, 'OPENPANEL_SECRET_KEY', None)
            
            if client_id and secret:
                self.client = OpenPanel(
                    client_id=client_id,
                    client_secret=secret
                )
                print("OpenPanel analytics initialized successfully")
            else:
                print("OpenPanel credentials not found - analytics disabled")
        except Exception as e:
            print(f"Failed to initialize OpenPanel: {e}")
            self.client = None
    
    def track_event(self, event_name: str, user_id: str = None, properties: Dict[str, Any] = None):
        """Track an event with optional user identification"""
        if not self.client:
            return
        
        try:
            if user_id:
                # Track event with user identification
                self.client.track(
                    event=event_name,
                    user_id=user_id,
                    properties=properties or {}
                )
            else:
                # Track anonymous event
                self.client.track(
                    event=event_name,
                    properties=properties or {}
                )
        except Exception as e:
            print(f"Failed to track event {event_name}: {e}")
    
    def identify_user(self, user_id: str, traits: Dict[str, Any] = None):
        """Identify a user with optional traits"""
        if not self.client:
            return
        
        try:
            self.client.identify(
                user_id=user_id,
                traits=traits or {}
            )
        except Exception as e:
            print(f"Failed to identify user {user_id}: {e}")
    
    def track_api_request(self, endpoint: str, method: str, user_id: str = None, 
                         status_code: int = None, response_time: float = None):
        """Track API request with metadata"""
        self.track_event('api_request', user_id, {
            'endpoint': endpoint,
            'method': method,
            'status_code': status_code,
            'response_time_ms': response_time * 1000 if response_time else None
        })
    
    def track_user_auth(self, user_id: str, email: str, name: str, method: str = 'google'):
        """Track user authentication event"""
        # Identify the user
        self.identify_user(user_id, {
            'email': email,
            'name': name,
            'auth_method': method
        })
        
        # Track auth event
        self.track_event('user_authenticated', user_id, {
            'auth_method': method,
            'email': email
        })
    
    def track_analysis_request(self, user_id: str, activity_type: str, template_id: str = None, 
                              video_size: int = None, custom_prompt: bool = False):
        """Track video analysis request"""
        self.track_event('analysis_requested', user_id, {
            'activity_type': activity_type,
            'template_id': template_id,
            'video_size_bytes': video_size,
            'custom_prompt': custom_prompt
        })
    
    def track_analysis_completion(self, user_id: str, activity_type: str, success: bool,
                                 processing_time: float = None, error: str = None,
                                 frames_analyzed: int = None):
        """Track video analysis completion"""
        self.track_event('analysis_completed', user_id, {
            'activity_type': activity_type,
            'success': success,
            'processing_time_ms': processing_time * 1000 if processing_time else None,
            'error': error,
            'frames_analyzed': frames_analyzed
        })
    
    def track_rate_limit(self, user_id: str, limit_type: str, current_usage: int, limit: int):
        """Track when user hits rate limits"""
        self.track_event('rate_limit_hit', user_id, {
            'limit_type': limit_type,
            'current_usage': current_usage,
            'limit': limit,
            'usage_percentage': (current_usage / limit) * 100 if limit > 0 else 0
        })
    
    def track_error(self, error_type: str, error_message: str, user_id: str = None, 
                   context: Dict[str, Any] = None):
        """Track application errors"""
        properties = {
            'error_type': error_type,
            'error_message': error_message,
            **(context or {})
        }
        self.track_event('backend_error', user_id, properties)
    
    def track_coaching_feedback(self, user_id: str, activity_type: str, feedback_type: str, feedback_length: int):
        """Track real-time coaching feedback"""
        self.track_event('coaching_feedback', user_id, {
            'activity_type': activity_type,
            'feedback_type': feedback_type,
            'feedback_length': feedback_length
        })


# Global analytics instance
analytics = AnalyticsService() 