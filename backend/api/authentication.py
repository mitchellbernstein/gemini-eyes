import json
from google.auth.transport import requests
from google.oauth2 import id_token
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import authentication, exceptions
from .analytics import analytics

User = get_user_model()

class GoogleTokenAuthentication(authentication.BaseAuthentication):
    """
    Google OAuth token authentication
    """
    
    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION')
        if not auth_header or not auth_header.startswith('Bearer '):
            return None
            
        token = auth_header.split(' ')[1]
        
        try:
            # Verify the token with Google
            idinfo = id_token.verify_oauth2_token(
                token, 
                requests.Request(), 
                settings.GOOGLE_CLIENT_ID
            )
            
            # Get or create user
            google_id = idinfo['sub']
            email = idinfo['email']
            first_name = idinfo.get('given_name', '')
            last_name = idinfo.get('family_name', '')
            profile_picture = idinfo.get('picture', '')
            
            user, created = User.objects.get_or_create(
                google_id=google_id,
                defaults={
                    'email': email,
                    'username': email,  # Use email as username
                    'first_name': first_name,
                    'last_name': last_name,
                    'profile_picture': profile_picture,
                }
            )
            
            # Track user authentication
            analytics.track_user_auth(
                user_id=str(user.id),
                email=email,
                name=f"{first_name} {last_name}".strip(),
                method='google'
            )
            
            # Track new user registration if created
            if created:
                analytics.track_event('user_registered', str(user.id), {
                    'email': email,
                    'name': f"{first_name} {last_name}".strip(),
                    'registration_method': 'google'
                })
            
            # Update profile info if user exists but info changed
            if not created:
                updated = False
                if user.email != email:
                    user.email = email
                    user.username = email
                    updated = True
                if user.first_name != first_name:
                    user.first_name = first_name
                    updated = True
                if user.last_name != last_name:
                    user.last_name = last_name
                    updated = True
                if user.profile_picture != profile_picture:
                    user.profile_picture = profile_picture
                    updated = True
                if updated:
                    user.save()
            
            return (user, None)
            
        except ValueError as e:
            raise exceptions.AuthenticationFailed(f'Invalid token: {str(e)}')
        except Exception as e:
            raise exceptions.AuthenticationFailed(f'Authentication failed: {str(e)}')

    def authenticate_header(self, request):
        return 'Bearer' 