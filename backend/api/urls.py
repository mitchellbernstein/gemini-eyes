from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.health_check, name='health_check'),
    path('templates/', views.get_templates, name='get_templates'),
    path('user/limits/', views.get_user_limits, name='get_user_limits'),
    path('analyze/', views.analyze_video, name='analyze_video'),
    path('auth/verify/', views.verify_google_token, name='verify_google_token'),
] 