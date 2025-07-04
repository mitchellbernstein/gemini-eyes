import os
import tempfile
import requests
import base64
from typing import List, Dict, Any
from django.conf import settings
import json
import httpx
import logging

# Make OpenCV optional for development
try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print("Warning: OpenCV not available. Video processing will be limited.")

logger = logging.getLogger(__name__)

class GeminiAnalysisService:
    """
    Service for analyzing videos using Google Gemini AI
    """
    
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY
        self.api_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
        self.timeout = 30  # Assuming a default timeout
    
    def extract_frames(self, video_path: str, max_frames: int = 30) -> List[str]:
        """
        Extract frames from video at 1 FPS rate for analysis
        Returns base64 encoded frames
        """
        if not CV2_AVAILABLE:
            raise ValueError("OpenCV not available. Please install opencv-python to process videos.")
        
        frames = []
        cap = cv2.VideoCapture(video_path)
        
        if not cap.isOpened():
            raise ValueError("Could not open video file")
        
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        
        # Sample frames at 1 FPS or evenly distribute if video is shorter
        frame_interval = max(fps, total_frames // max_frames) if total_frames > max_frames else 1
        
        frame_count = 0
        while cap.isOpened() and len(frames) < max_frames:
            ret, frame = cap.read()
            if not ret:
                break
                
            if frame_count % frame_interval == 0:
                # Resize frame to reduce payload size
                height, width = frame.shape[:2]
                if width > 1280:
                    scale = 1280 / width
                    new_width = 1280
                    new_height = int(height * scale)
                    frame = cv2.resize(frame, (new_width, new_height))
                
                # Convert to JPEG and then to base64
                _, buffer = cv2.imencode('.jpg', frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
                frame_b64 = base64.b64encode(buffer).decode('utf-8')
                frames.append(frame_b64)
            
            frame_count += 1
        
        cap.release()
        return frames
    
    def analyze_activity(self, video_file, prompt: str) -> Dict[str, Any]:
        """
        Analyze activity video using Gemini AI
        """
        try:
            # Save uploaded file temporarily
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as temp_file:
                for chunk in video_file.chunks():
                    temp_file.write(chunk)
                temp_path = temp_file.name
            
            # Extract frames
            frames = self.extract_frames(temp_path, max_frames=20)
            
            # Clean up temp file
            os.unlink(temp_path)
            
            if not frames:
                raise ValueError("No frames could be extracted from video")
            
            # Prepare request for Gemini
            parts = [{"text": prompt}]
            
            # Add frames to request
            for i, frame_b64 in enumerate(frames):
                parts.append({
                    "inline_data": {
                        "mime_type": "image/jpeg",
                        "data": frame_b64
                    }
                })
            
            payload = {
                "contents": [{
                    "parts": parts
                }],
                "generationConfig": {
                    "temperature": 0.7,
                    "topK": 40,
                    "topP": 0.95,
                    "maxOutputTokens": 1024,
                }
            }
            
            # Make request to Gemini API
            headers = {
                "Content-Type": "application/json"
            }
            
            response = requests.post(
                f"{self.api_url}?key={self.api_key}",
                headers=headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            
            result = response.json()
            
            if 'candidates' not in result or not result['candidates']:
                raise ValueError("No analysis generated by Gemini")
            
            analysis_text = result['candidates'][0]['content']['parts'][0]['text']
            
            return {
                "success": True,
                "analysis": analysis_text,
                "frames_analyzed": len(frames),
                "prompt_used": prompt
            }
            
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": f"API request failed: {str(e)}",
                "analysis": "Sorry, analysis service is temporarily unavailable."
            }
        except Exception as e:
            return {
                "success": False, 
                "error": f"Analysis failed: {str(e)}",
                "analysis": "Sorry, we couldn't analyze your video. Please try again."
            }
    
    def validate_video(self, video_file) -> Dict[str, Any]:
        """
        Validate video file before processing
        """
        # Check file size (10MB limit)
        if video_file.size > settings.VIDEO_MAX_SIZE_MB * 1024 * 1024:
            return {
                "valid": False,
                "error": f"Video file too large. Maximum size is {settings.VIDEO_MAX_SIZE_MB}MB"
            }
        
        # Check file type
        allowed_types = ['video/mp4', 'video/webm', 'video/quicktime']
        if video_file.content_type not in allowed_types:
            return {
                "valid": False,
                "error": "Invalid video format. Please use MP4, WebM, or MOV format."
            }
        
        try:
            # Save temporarily to check duration
            with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as temp_file:
                for chunk in video_file.chunks():
                    temp_file.write(chunk)
                temp_path = temp_file.name
            
            # Check duration (skip if OpenCV not available)
            if not CV2_AVAILABLE:
                os.unlink(temp_path)
                return {"valid": True, "warning": "Duration validation skipped - OpenCV not available"}
            
            cap = cv2.VideoCapture(temp_path)
            if cap.isOpened():
                fps = cap.get(cv2.CAP_PROP_FPS)
                frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
                duration = frame_count / fps if fps > 0 else 0
                cap.release()
                
                if duration > settings.VIDEO_MAX_DURATION_SECONDS:
                    os.unlink(temp_path)
                    return {
                        "valid": False,
                        "error": f"Video too long. Maximum duration is {settings.VIDEO_MAX_DURATION_SECONDS} seconds"
                    }
            
            os.unlink(temp_path)
            return {"valid": True}
        
        except Exception as e:
            return {
                "valid": False,
                "error": f"Could not validate video: {str(e)}"
            }
    
    def analyze_coaching_session(self, coaching_data: Dict[str, Any], prompt: str) -> Dict[str, Any]:
        """
        Analyze coaching session data using Gemini AI (much faster than video analysis)
        """
        try:
            # Create a comprehensive summary of the coaching session
            session_summary = self._create_session_summary(coaching_data)
            
            # Create analysis prompt that focuses on the coaching data
            analysis_prompt = f"""
            {prompt}
            
            Instead of analyzing video frames, please provide feedback based on this real-time coaching session data:
            
            {session_summary}
            
            Please provide:
            1. Overall performance assessment
            2. Specific areas for improvement based on the real-time feedback given
            3. Strengths observed during the session
            4. Recommendations for future training
            5. Form analysis based on the rep-by-rep data
            
            Be specific and actionable in your feedback.
            """
            
            # Prepare request for Gemini (text-only, much faster)
            payload = {
                "contents": [{
                    "parts": [{"text": analysis_prompt}]
                }],
                "generationConfig": {
                    "temperature": 0.7,
                    "topK": 40,
                    "topP": 0.95,
                    "maxOutputTokens": 1024,
                }
            }
            
            # Make request to Gemini API
            headers = {
                "Content-Type": "application/json"
            }
            
            response = requests.post(
                f"{self.api_url}?key={self.api_key}",
                headers=headers,
                json=payload,
                timeout=30
            )
            response.raise_for_status()
            
            result = response.json()
            
            if 'candidates' not in result or not result['candidates']:
                raise ValueError("No analysis generated by Gemini")
            
            analysis_text = result['candidates'][0]['content']['parts'][0]['text']
            
            return {
                "success": True,
                "analysis": analysis_text,
                "coaching_summary": self._extract_coaching_summary(coaching_data),
                "analysis_type": "Smart Coaching Analysis",
                "prompt_used": analysis_prompt
            }
            
        except requests.exceptions.RequestException as e:
            return {
                "success": False,
                "error": f"API request failed: {str(e)}",
                "analysis": "Sorry, analysis service is temporarily unavailable."
            }
        except Exception as e:
            return {
                "success": False, 
                "error": f"Analysis failed: {str(e)}",
                "analysis": "Sorry, we couldn't analyze your coaching session. Please try again."
            }
    
    def _create_session_summary(self, coaching_data: Dict[str, Any]) -> str:
        """Create a comprehensive text summary of the coaching session"""
        summary_parts = []
        
        # Basic session info
        activity = coaching_data.get('activityName', 'Unknown Activity')
        total_reps = coaching_data.get('totalReps', 0)
        avg_score = coaching_data.get('averageFormScore', 0)
        duration = coaching_data.get('endTime', 0) - coaching_data.get('startTime', 0)
        duration_seconds = duration / 1000 if duration > 0 else 0
        
        summary_parts.append(f"Activity: {activity}")
        summary_parts.append(f"Session Duration: {duration_seconds:.1f} seconds")
        summary_parts.append(f"Total Reps Completed: {total_reps}")
        summary_parts.append(f"Average Form Score: {avg_score}%")
        
        # Rep-by-rep analysis
        reps = coaching_data.get('reps', [])
        if reps:
            summary_parts.append("\nRep-by-Rep Performance:")
            for rep in reps[:10]:  # Limit to first 10 reps for brevity
                rep_duration = (rep.get('endTime', 0) - rep.get('startTime', 0)) / 1000
                cues_count = len(rep.get('cuesGiven', []))
                summary_parts.append(
                    f"  Rep {rep.get('number', '?')}: {rep.get('formScore', 0)}% form, "
                    f"{rep_duration:.1f}s duration, {cues_count} coaching cues"
                )
        
        # Coaching cues analysis
        all_cues = coaching_data.get('allCues', [])
        if all_cues:
            cue_types = {}
            for cue in all_cues:
                cue_type = cue.get('type', 'unknown')
                cue_types[cue_type] = cue_types.get(cue_type, 0) + 1
            
            summary_parts.append(f"\nTotal Coaching Cues Given: {len(all_cues)}")
            for cue_type, count in cue_types.items():
                summary_parts.append(f"  {cue_type}: {count}")
            
            # Recent cues (most relevant for analysis)
            summary_parts.append("\nMost Recent Coaching Feedback:")
            recent_cues = all_cues[-5:] if len(all_cues) > 5 else all_cues
            for cue in recent_cues:
                summary_parts.append(f"  - {cue.get('message', 'No message')} ({cue.get('type', 'unknown')})")
        
        return "\n".join(summary_parts)
    
    def _extract_coaching_summary(self, coaching_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract key metrics for the response"""
        total_reps = coaching_data.get('totalReps', 0)
        avg_score = coaching_data.get('averageFormScore', 0)
        duration = coaching_data.get('endTime', 0) - coaching_data.get('startTime', 0)
        duration_seconds = duration / 1000 if duration > 0 else 0
        
        # Find best rep score
        reps = coaching_data.get('reps', [])
        best_rep_score = max([rep.get('formScore', 0) for rep in reps]) if reps else 0
        
        # Count cues by type
        all_cues = coaching_data.get('allCues', [])
        warning_cues = len([c for c in all_cues if c.get('type') == 'warning'])
        good_cues = len([c for c in all_cues if c.get('type') == 'good'])
        
        # Generate improvement areas based on cue patterns
        improvement_areas = []
        strengths = []
        
        if warning_cues > good_cues:
            improvement_areas.append("Form consistency needs work")
        if avg_score < 70:
            improvement_areas.append("Focus on technique over speed")
        if total_reps > 0 and duration_seconds > 0:
            pace = total_reps / (duration_seconds / 60)  # reps per minute
            if pace > 30:  # Assuming jumping jacks
                improvement_areas.append("Slow down for better form")
        
        if good_cues > warning_cues:
            strengths.append("Good form awareness")
        if avg_score > 80:
            strengths.append("Consistent technique")
        if best_rep_score > 90:
            strengths.append("Capable of excellent form")
        
        return {
            "total_reps": total_reps,
            "average_form_score": avg_score,
            "best_rep_score": best_rep_score,
            "improvement_areas": improvement_areas,
            "strengths": strengths,
            "session_duration": duration_seconds,
            "cues_given": len(all_cues)
        }
    
    async def analyze_video_frames(self, frames_data: List[str], prompt: str) -> str:
        """
        Analyze a sequence of video frames for comprehensive feedback.
        """
        if not self.api_key:
            return "Error: Gemini API key not configured"

        if not frames_data:
            return "Error: No frames provided for analysis"

        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent?key={self.api_key}"
            
            # Construct a multi-image prompt
            parts = [{"text": prompt}]
            for frame_data in frames_data:
                if frame_data and len(frame_data.strip()) > 50:
                    parts.append({
                        "inline_data": {
                            "mime_type": "image/jpeg",
                            "data": frame_data
                        }
                    })

            payload = {
                "contents": [{"parts": parts}],
                "generationConfig": {
                    "temperature": 0.3,
                    "topK": 32,
                    "topP": 1,
                    "maxOutputTokens": 256,
                    "stopSequences": []
                },
                "safetySettings": [
                    {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
                    {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
                    {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"},
                    {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE"}
                ]
            }

            headers = {'Content-Type': 'application/json'}
            
            # Make the async request
            async with httpx.AsyncClient() as client:
                response = await client.post(url, json=payload, headers=headers, timeout=self.timeout)

            response.raise_for_status()
            response_json = response.json()
            
            if 'candidates' in response_json and response_json['candidates']:
                content = response_json['candidates'][0]['content']['parts'][0]['text']
                return content.strip()
            else:
                logger.warning(f"Gemini API response missing candidates: {response_json}")
                return ""

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP Error analyzing frames: {e.response.status_code} - {e.response.text}")
            # Reraise to be handled by the coaching service
            raise e
        except Exception as e:
            logger.error(f"An unexpected error occurred during frame analysis: {e}")
            raise e

    async def analyze_video_frame(self, frame_data: str, prompt: str) -> str:
        """Analyze a single video frame for real-time coaching."""
        # This method can now be a simple wrapper around the batch method
        if not frame_data:
             return await self.analyze_video_frames([], prompt)
        return await self.analyze_video_frames([frame_data], prompt) 