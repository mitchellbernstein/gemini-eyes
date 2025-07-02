from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from datetime import datetime, timedelta

class User(AbstractUser):
    google_id = models.CharField(max_length=100, unique=True)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=30)
    last_name = models.CharField(max_length=30)
    profile_picture = models.URLField(null=True, blank=True)
    
    # Rate limiting fields
    analyses_today = models.IntegerField(default=0)
    analyses_this_hour = models.IntegerField(default=0)
    last_analysis = models.DateTimeField(null=True, blank=True)
    daily_reset_date = models.DateField(default=timezone.now)
    hourly_reset_time = models.DateTimeField(default=timezone.now)
    
    # Account status
    is_banned = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def reset_daily_count_if_needed(self):
        """Reset daily analysis count if it's a new day"""
        today = timezone.now().date()
        
        if self.daily_reset_date < today:
            self.analyses_today = 0
            self.daily_reset_date = today
            self.save(update_fields=['analyses_today', 'daily_reset_date'])

    def reset_hourly_count_if_needed(self):
        """Reset hourly analysis count if it's been more than an hour"""
        now = timezone.now()
        if self.hourly_reset_time < now - timedelta(hours=1):
            self.analyses_this_hour = 0
            self.hourly_reset_time = now
            self.save(update_fields=['analyses_this_hour', 'hourly_reset_time'])

    def can_analyze(self):
        """Check if user can perform another analysis"""
        if self.is_banned:
            return False, "Account is banned"
        
        self.reset_daily_count_if_needed()
        self.reset_hourly_count_if_needed()
        
        if self.analyses_today >= 50:
            return False, "Daily limit of 50 analyses reached"
        
        if self.analyses_this_hour >= 10:
            return False, "Hourly limit of 10 analyses reached"
        
        # Check minimum time between analyses (6 minutes)
        if self.last_analysis:
            time_since_last = timezone.now() - self.last_analysis
            if time_since_last < timedelta(minutes=6):
                minutes_left = 6 - int(time_since_last.total_seconds() / 60)
                return False, f"Please wait {minutes_left} more minutes"
        
        return True, "OK"

    def record_analysis(self):
        """Record that user performed an analysis"""
        self.reset_daily_count_if_needed()
        self.reset_hourly_count_if_needed()
        
        self.analyses_today += 1
        self.analyses_this_hour += 1
        self.last_analysis = timezone.now()
        self.save(update_fields=['analyses_today', 'analyses_this_hour', 'last_analysis'])

    def __str__(self):
        return f"{self.email} ({self.first_name} {self.last_name})" 