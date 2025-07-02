from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from .models import User

@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ('email', 'first_name', 'last_name', 'analyses_today', 'analyses_this_hour', 'is_banned', 'created_at')
    list_filter = ('is_banned', 'created_at', 'daily_reset_date')
    search_fields = ('email', 'first_name', 'last_name', 'google_id')
    readonly_fields = ('google_id', 'created_at', 'updated_at', 'last_analysis')
    
    fieldsets = (
        (None, {'fields': ('email', 'username', 'password')}),
        ('Personal info', {'fields': ('first_name', 'last_name', 'profile_picture')}),
        ('Google OAuth', {'fields': ('google_id',)}),
        ('Rate Limiting', {'fields': ('analyses_today', 'analyses_this_hour', 'last_analysis', 'daily_reset_date', 'hourly_reset_time')}),
        ('Account Status', {'fields': ('is_banned', 'is_active', 'is_staff', 'is_superuser')}),
        ('Important dates', {'fields': ('last_login', 'date_joined', 'created_at', 'updated_at')}),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'username', 'password1', 'password2', 'first_name', 'last_name'),
        }),
    ) 