import requests
import tempfile
import os
from typing import Dict, Any, Optional
from django.conf import settings
from django.http import HttpResponse
import io

class ElevenLabsService:
    """
    ElevenLabs Text-to-Speech service for high-quality coaching voice feedback
    """
    
    def __init__(self):
        self.api_key = getattr(settings, 'ELEVENLABS_API_KEY', None)
        self.base_url = "https://api.elevenlabs.io/v1"
        
        # Voice IDs for different coaching styles - Confident Male Voices
        self.voices = {
            'coach': 'pNInz6obpgDQGcFmaJgB',  # Adam - Deep, confident male
            'trainer': 'TxGEqnHWrfWFTfGW9XjX',  # Josh - Enthusiastic male trainer
            'instructor': 'ErXwobaYiN019PkySvjV',  # Antoni - Clear American male
            'default': 'pNInz6obpgDQGcFmaJgB'  # Adam as default - confident male
        }
    
    def get_voice_for_activity(self, activity_name: str) -> str:
        """Get appropriate voice based on activity type"""
        activity_lower = activity_name.lower()
        
        if any(sport in activity_lower for sport in ['basketball', 'tennis', 'volleyball', 'soccer']):
            return self.voices['coach']  # Sports coach voice
        elif any(fitness in activity_lower for fitness in ['squat', 'push-up', 'burpee', 'jumping', 'plank']):
            return self.voices['trainer']  # Energetic trainer voice
        elif any(skill in activity_lower for skill in ['golf', 'knife', 'yoga', 'dance']):
            return self.voices['instructor']  # Clear instructional voice
        else:
            return self.voices['default']
    
    def text_to_speech(self, text: str, activity_name: str = '', voice_settings: Dict[str, Any] = None) -> Optional[bytes]:
        """
        Convert text to speech using ElevenLabs API
        
        Args:
            text: Text to convert to speech
            activity_name: Activity name to determine appropriate voice
            voice_settings: Optional voice settings (stability, similarity_boost, etc.)
            
        Returns:
            Audio bytes or None if failed
        """
        if not self.api_key:
            print("❌ ElevenLabs API key not configured in environment - falling back to browser speech")
            print("💡 To enable ElevenLabs voice: Set ELEVENLABS_API_KEY in your .env file")
            return None
        
        if not text or len(text.strip()) == 0:
            return None
        
        try:
            # Select appropriate voice
            voice_id = self.get_voice_for_activity(activity_name)
            
            # Default voice settings optimized for coaching feedback
            default_settings = {
                "stability": 0.75,        # Good balance of consistency
                "similarity_boost": 0.85, # High similarity to original voice
                "style": 0.15,            # Slight style variation for naturalness
                "use_speaker_boost": True # Enhanced clarity
            }
            
            # Merge with provided settings
            if voice_settings:
                default_settings.update(voice_settings)
            
            # Prepare request
            url = f"{self.base_url}/text-to-speech/{voice_id}"
            
            headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": self.api_key
            }
            
            data = {
                "text": text,
                "model_id": "eleven_monolingual_v1",  # Fast, high-quality model
                "voice_settings": default_settings
            }
            
            # Make request
            response = requests.post(url, json=data, headers=headers, timeout=10)
            response.raise_for_status()
            
            return response.content
            
        except requests.exceptions.RequestException as e:
            print(f"ElevenLabs API request failed: {e}")
            return None
        except Exception as e:
            print(f"ElevenLabs TTS error: {e}")
            return None
    
    def create_coaching_audio(self, feedback_text: str, activity_name: str, feedback_type: str = 'tip') -> Optional[bytes]:
        """
        Create coaching audio with activity-specific voice and tone
        
        Args:
            feedback_text: The coaching feedback text
            activity_name: Name of the activity (for voice selection)
            feedback_type: Type of feedback ('good', 'warning', 'tip', 'rep_complete')
            
        Returns:
            Audio bytes or None if failed
        """
        # Adjust voice settings based on feedback type
        voice_settings = {}
        
        if feedback_type == 'good':
            # Encouraging tone
            voice_settings = {
                "stability": 0.8,
                "similarity_boost": 0.9,
                "style": 0.25  # More expressive for positive feedback
            }
        elif feedback_type == 'warning':
            # More serious, clear tone
            voice_settings = {
                "stability": 0.9,
                "similarity_boost": 0.8, 
                "style": 0.1   # Less variation for important corrections
            }
        elif feedback_type == 'rep_complete':
            # Celebratory tone
            voice_settings = {
                "stability": 0.7,
                "similarity_boost": 0.85,
                "style": 0.3   # More expressive for celebration
            }
        
        return self.text_to_speech(feedback_text, activity_name, voice_settings)
    
    def get_available_voices(self) -> Dict[str, Any]:
        """Get list of available voices from ElevenLabs"""
        if not self.api_key:
            return {}
        
        try:
            url = f"{self.base_url}/voices"
            headers = {"xi-api-key": self.api_key}
            
            response = requests.get(url, headers=headers, timeout=5)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            print(f"Failed to get ElevenLabs voices: {e}")
            return {}
    
    def is_available(self) -> bool:
        """Check if ElevenLabs service is available"""
        return bool(self.api_key) 