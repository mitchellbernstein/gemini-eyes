from django.urls import path
from . import views

urlpatterns = [
    path('health/', views.health_check, name='health_check'),
    path('templates/', views.get_templates, name='get_templates'),
    path('user/limits/', views.get_user_limits, name='get_user_limits'),
    path('analyze/', views.analyze_video, name='analyze_video'),
    path('realtime-coaching/', views.realtime_coaching, name='realtime_coaching'),
    path('analyze-rep/', views.analyze_complete_rep, name='analyze_complete_rep'),
    path('speech/', views.generate_speech, name='generate_speech'),
    path('auth/verify/', views.verify_google_token, name='verify_google_token'),
    # New live coaching endpoints
    path('live-coaching/start/', views.start_live_coaching, name='start_live_coaching'),
    path('live-coaching/stop/', views.stop_live_coaching, name='stop_live_coaching'),
    path('live-coaching/analyze-frame/', views.analyze_live_frame, name='analyze_live_frame'),
    path('live-coaching/feedback/', views.get_live_feedback, name='get_live_feedback'),
] 