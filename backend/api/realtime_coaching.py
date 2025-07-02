import time
import logging
from typing import Dict, Any, Optional, List
from .gemini_service import GeminiAnalysisService

logger = logging.getLogger(__name__)

class RealtimeCoachingService:
    """
    Real-time coaching service that provides expert feedback after each rep
    """
    
    def __init__(self):
        self.gemini_service = GeminiAnalysisService()
        self.last_coaching_time = {}
        self.user_states = {}  # Track user coaching state per session
    
    def get_coaching_interval(self, activity_type: str) -> float:
        """Get appropriate coaching interval for each activity type"""
        intervals = {
            'basketball': 2.0,  # After each shot attempt
            'squat': 1.5,      # After each rep
            'pushup': 1.5,     # After each rep  
            'tennis': 2.5,     # After each swing
            'golf': 3.0,       # After each swing
            'custom': 2.0      # General interval
        }
        return intervals.get(activity_type, 2.0)
    
    def should_provide_coaching(self, user_id: str, activity_type: str) -> bool:
        """Rate limiting for coaching feedback"""
        current_time = time.time()
        interval = self.get_coaching_interval(activity_type)
        
        if user_id not in self.last_coaching_time:
            self.last_coaching_time[user_id] = 0
            
        if current_time - self.last_coaching_time[user_id] >= interval:
            self.last_coaching_time[user_id] = current_time
            return True
            
        return False
    
    def should_analyze_frame(self, user_id: str, current_time: int) -> bool:
        """
        Check if we should analyze this frame (rate limiting for real-time analysis)
        """
        # Convert milliseconds to seconds
        current_time_sec = current_time / 1000
        
        if user_id not in self.last_coaching_time:
            self.last_coaching_time[user_id] = 0
            return True
            
        # Allow analysis every 2 seconds for real-time coaching
        time_diff = current_time_sec - self.last_coaching_time[user_id]
        return time_diff >= 2.0
    
    def get_user_state(self, user_id: str) -> Dict[str, Any]:
        """Get or create user coaching state"""
        if user_id not in self.user_states:
            self.user_states[user_id] = {
                'phase': 'setup',  # setup, monitoring, post_rep
                'rep_count': 0,
                'last_feedback': None,
                'movement_detected': False
            }
        return self.user_states[user_id]
    
    def detect_movement_completion(self, pose_data: Dict[str, Any], activity_type: str) -> bool:
        """Detect when a rep/movement is completed based on pose analysis"""
        if not pose_data or 'landmarks' not in pose_data:
            return False
            
        landmarks = pose_data['landmarks']
        
        try:
            if activity_type == 'squat':
                # Detect squat completion: hip goes down then back up
                if len(landmarks) >= 24:  # Ensure we have hip landmarks
                    left_hip = landmarks[23]
                    right_hip = landmarks[24]
                    left_knee = landmarks[25] if len(landmarks) > 25 else None
                    right_knee = landmarks[26] if len(landmarks) > 26 else None
                    
                    if left_knee and right_knee:
                        # Simple heuristic: if hips are above knees, squat completed
                        hip_avg_y = (left_hip.get('y', 0) + right_hip.get('y', 0)) / 2
                        knee_avg_y = (left_knee.get('y', 0) + right_knee.get('y', 0)) / 2
                        
                        # In normalized coordinates, lower y = higher position
                        return hip_avg_y < knee_avg_y  # Hips above knees = standing position
                        
            elif activity_type == 'pushup':
                # Detect pushup completion: body goes down then back up
                if len(landmarks) >= 12:  # Ensure we have shoulder landmarks
                    left_shoulder = landmarks[11]
                    right_shoulder = landmarks[12]
                    left_wrist = landmarks[15] if len(landmarks) > 15 else None
                    right_wrist = landmarks[16] if len(landmarks) > 16 else None
                    
                    if left_wrist and right_wrist:
                        # Simple heuristic: if shoulders are above wrists, pushup completed
                        shoulder_avg_y = (left_shoulder.get('y', 0) + right_shoulder.get('y', 0)) / 2
                        wrist_avg_y = (left_wrist.get('y', 0) + right_wrist.get('y', 0)) / 2
                        
                        return shoulder_avg_y < wrist_avg_y  # Shoulders above wrists = up position
                        
            elif activity_type == 'basketball':
                # Detect shot completion: arms go up then come down
                if len(landmarks) >= 16:  # Ensure we have arm landmarks
                    left_wrist = landmarks[15]
                    right_wrist = landmarks[16]
                    nose = landmarks[0]
                    
                    # Simple heuristic: if wrists are below nose level, shot completed
                    wrist_avg_y = (left_wrist.get('y', 0) + right_wrist.get('y', 0)) / 2
                    nose_y = nose.get('y', 0)
                    
                    return wrist_avg_y > nose_y  # Wrists below nose = arms down
                    
            elif activity_type in ['tennis', 'golf']:
                # Detect swing completion: significant arm movement
                if len(landmarks) >= 16:  # Ensure we have arm landmarks
                    left_wrist = landmarks[15]
                    right_wrist = landmarks[16]
                    
                    # Simple heuristic: if wrists are in resting position (complex detection needed)
                    # For now, return True periodically to simulate swing detection
                    return True
                    
        except (KeyError, IndexError, TypeError) as e:
            logger.warning(f"Error in movement detection for {activity_type}: {e}")
            
        return False
    
    def get_expert_coaching_prompt(self, activity_type: str, phase: str, pose_data: Dict[str, Any], user_state: Dict[str, Any]) -> str:
        """Get expert-level coaching prompts based on activity and phase"""
        
        base_expert_context = """
        You are a world-class expert coach analyzing real-time video. Give specific, actionable feedback like a top-tier personal trainer would.
        
        Focus on:
        - Specific technical improvements 
        - What they did wrong/right in that exact rep
        - Immediate corrections for next rep
        - Safety concerns
        
        Keep responses brief (1-2 sentences max), direct, and expert-level.
        """
        
        expert_personas = {
            'basketball': """
            You are Phil Jackson's shooting coach. You've trained Kobe, MJ, and countless NBA champions.
            
            Key areas to analyze:
            - Shooting form: elbow alignment, follow-through, arc
            - Footwork: base, balance, jump mechanics  
            - Release: consistent form, proper rotation
            - Shot selection: positioning, timing
            
            Common issues to catch:
            - Shooting off the dribble vs set shot
            - Elbow flare, inconsistent release point
            - Poor footwork, off-balance shots
            - Low arc, poor follow-through
            """,
            
            'squat': """
            You are Louie Simmons from Westside Barbell. You've coached world record holders and powerlifting champions.
            
            Key areas to analyze:
            - Depth: hip crease below knee level
            - Knee tracking: knees out, no valgus collapse
            - Back position: neutral spine, chest up
            - Hip drive: proper hip hinge pattern
            
            Common issues to catch:
            - Knee cave (valgus), insufficient depth
            - Forward lean, butt wink
            - Heel rise, weight on toes
            - Poor hip drive, quad dominance
            """,
            
            'pushup': """
            You are a Navy SEAL instructor who has trained thousands of elite operators.
            
            Key areas to analyze:
            - Body alignment: straight line from head to heels
            - Depth: chest touches ground or close
            - Elbow position: 45-degree angle, not flared
            - Core engagement: no sagging hips
            
            Common issues to catch:
            - Sagging hips, piked position
            - Partial range of motion
            - Elbow flare, shoulder impingement
            - Head position, neck strain
            """,
            
            'tennis': """
            You are Brad Gilbert, former coach to Andre Agassi and Andy Roddick.
            
            Key areas to analyze:
            - Grip: proper continental/eastern grip
            - Swing path: low to high, proper contact point
            - Footwork: split step, recovery
            - Follow-through: complete swing, balance
            
            Common issues to catch:
            - Late preparation, rushed swing
            - Poor contact point, timing
            - Incomplete follow-through
            - Footwork problems, off-balance finish
            """,
            
            'golf': """
            You are Butch Harmon, who coached Tiger Woods to 6 major championships.
            
            Key areas to analyze:
            - Setup: grip, stance, ball position, alignment
            - Backswing: proper rotation, club plane
            - Downswing: sequence, weight transfer
            - Impact: club face, swing path
            - Follow-through: balance, finish position
            
            Common issues to catch:
            - Over-the-top swing, early extension
            - Poor weight transfer, reverse pivot
            - Club face issues at impact
            - Loss of posture, balance problems
            """,
            
            'custom': """
            You are a world-class movement specialist who has trained Olympic athletes across all sports.
            
            Analyze whatever movement you see and provide expert feedback on:
            - Movement quality and efficiency
            - Safety and injury prevention
            - Technical improvements
            - Performance optimization
            """,
        }
        
        activity_prompt = expert_personas.get(activity_type, expert_personas['custom'])
        
        if phase == 'setup':
            return f"""
            {base_expert_context}
            {activity_prompt}
            
            The user is just getting started. Give them expert setup instructions to get into proper position.
            Be specific about stance, grip, positioning - whatever they need to know before starting.
            
            Do NOT give generic template advice. Be specific and expert-level.
            """
            
        elif phase == 'post_rep':
            rep_count = user_state.get('rep_count', 0)
            return f"""
            {base_expert_context}
            {activity_prompt}
            
            The user just completed rep #{rep_count}. Analyze their form in this specific rep and give immediate feedback.
            
            Based on the pose data, tell them:
            1. What they did wrong (if anything)
            2. What to focus on for the next rep
            
            Be direct, specific, and actionable. No generic advice.
            
            Pose analysis data: {pose_data}
            """
            
        return f"{base_expert_context}\n{activity_prompt}\n\nProvide expert coaching based on what you observe."
    
    async def get_coaching_feedback(self, user_id: str, activity_type: str, pose_data: Dict[str, Any], frame_data: str) -> Optional[str]:
        """
        Provide expert coaching feedback based on movement analysis
        """
        try:
            if not self.should_provide_coaching(user_id, activity_type):
                return None
                
            user_state = self.get_user_state(user_id)
            
            # Detect if movement/rep was completed
            movement_completed = self.detect_movement_completion(pose_data, activity_type)
            
            # State management
            if user_state['phase'] == 'setup':
                # First time - give setup instructions
                phase = 'setup'
                user_state['phase'] = 'monitoring'
                
            elif movement_completed and user_state['phase'] == 'monitoring':
                # Rep completed - give post-rep feedback
                phase = 'post_rep'
                user_state['rep_count'] += 1
                user_state['movement_detected'] = True
                
            else:
                # Still monitoring - no feedback needed
                return None
            
            # Get expert coaching prompt
            coaching_prompt = self.get_expert_coaching_prompt(activity_type, phase, pose_data, user_state)
            
            # Get AI coaching response
            full_prompt = f"""
            {coaching_prompt}
            
            Frame data: {frame_data}
            """
            
            response = await self.gemini_service.analyze_video_frame(
                frame_data, 
                full_prompt
            )
            
            if response:
                user_state['last_feedback'] = response
                logger.info(f"Coaching feedback provided for {activity_type} - Phase: {phase}, Rep: {user_state['rep_count']}")
                return response
                
        except Exception as e:
            logger.error(f"Error getting coaching feedback: {e}")
            
        return None
    
    def reset_user_state(self, user_id: str):
        """Reset user state for new session"""
        if user_id in self.user_states:
            del self.user_states[user_id]
        if user_id in self.last_coaching_time:
            del self.last_coaching_time[user_id]
    
    def analyze_live_frame(self, frame_data: str, activity_name: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze a live frame for real-time coaching feedback
        """
        try:
            user_id = context.get('user_id', 'anonymous')
            
            # Check if we should provide coaching for this user/activity
            if not self.should_provide_coaching(user_id, activity_name):
                return {
                    'success': False,
                    'message': 'Coaching rate limited'
                }
            
            # Simple real-time coaching responses based on activity
            feedback_responses = {
                'basketball': [
                    "Keep your elbow under the ball",
                    "Follow through with your wrist",
                    "Square your shoulders to the basket",
                    "Use your legs for power",
                    "Keep your shooting hand straight"
                ],
                'squat': [
                    "Keep your chest up",
                    "Push your knees out",
                    "Go deeper if you can",
                    "Drive through your heels",
                    "Keep your core tight"
                ],
                'pushup': [
                    "Keep your body straight",
                    "Lower your chest to the ground",
                    "Don't let your hips sag",
                    "Keep your core engaged",
                    "Full range of motion"
                ],
                'tennis': [
                    "Follow through across your body",
                    "Keep your eye on the ball",
                    "Step into the shot",
                    "Rotate your shoulders",
                    "Good preparation"
                ],
                'golf': [
                    "Keep your head steady",
                    "Rotate your hips",
                    "Follow through to finish",
                    "Keep your left arm straight",
                    "Smooth tempo"
                ]
            }
            
            # Get feedback for this activity
            activity_feedback = feedback_responses.get(activity_name.lower(), [
                "Good form!",
                "Keep it up!",
                "Nice technique",
                "Stay focused",
                "Great effort!"
            ])
            
            # Better rotation through feedback to avoid repeats
            user_state = self.get_user_state(user_id)
            last_feedback = user_state.get('last_feedback', '')
            
            # Try to avoid repeating the same message
            available_feedback = [f for f in activity_feedback if f != last_feedback]
            if not available_feedback:
                available_feedback = activity_feedback
            
            import random
            feedback = random.choice(available_feedback)
            feedback_type = random.choice(['tip', 'good', 'warning'])
            
            # Store this feedback to avoid immediate repeats
            user_state['last_feedback'] = feedback
            
            return {
                'success': True,
                'feedback': feedback,
                'type': feedback_type,
                'activity': activity_name
            }
            
        except Exception as e:
            logger.error(f"Error in live frame analysis: {e}")
            return {
                'success': False,
                'error': str(e)
            } 