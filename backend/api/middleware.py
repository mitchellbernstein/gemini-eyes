import json
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
from django.contrib.auth import get_user_model

User = get_user_model()

class RateLimitMiddleware(MiddlewareMixin):
    """
    Rate limiting middleware for API endpoints
    """
    
    def process_request(self, request):
        # Only apply rate limiting to API endpoints that require it
        if request.path.startswith('/api/analyze/'):
            if hasattr(request, 'user') and request.user.is_authenticated:
                can_analyze, message = request.user.can_analyze()
                if not can_analyze:
                    return JsonResponse({
                        'error': 'Rate limit exceeded',
                        'message': message,
                        'daily_remaining': max(0, 50 - request.user.analyses_today),
                        'hourly_remaining': max(0, 10 - request.user.analyses_this_hour)
                    }, status=429)
        
        return None 