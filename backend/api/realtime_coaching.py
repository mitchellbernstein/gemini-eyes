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
            # Discrete rep exercises - feedback after each rep/set
            'basketball': 3.0,  # After each shot attempt - longer to avoid overlap
            'squat': 2.5,      # After each rep - slightly longer
            'pushup': 2.5,     # After each rep - slightly longer
            'jumping jack': 2.5, # After each rep
            
            # Swing sports - longer intervals due to setup time
            'tennis': 4.0,     # After each swing - need time for setup
            'golf': 5.0,       # After each swing - longer setup and analysis
            
            # Hold exercises - different timing pattern
            'plank': 8.0,      # Every 8 seconds for form corrections
            'wall sit': 8.0,   # Every 8 seconds for encouragement
            
            # Default
            'custom': 3.0      # Conservative general interval
        }
        
        # Check if activity name contains key terms
        activity_lower = activity_type.lower()
        
        if 'plank' in activity_lower:
            return intervals['plank']
        elif 'golf' in activity_lower:
            return intervals['golf']
        elif 'tennis' in activity_lower:
            return intervals['tennis']
        elif 'basketball' in activity_lower:
            return intervals['basketball'] 
        elif 'squat' in activity_lower:
            return intervals['squat']
        elif 'pushup' in activity_lower or 'push-up' in activity_lower or 'push up' in activity_lower:
            return intervals['pushup']
        elif 'jumping jack' in activity_lower:
            return intervals['jumping jack']
        elif 'wall sit' in activity_lower:
            return intervals['wall sit']
        else:
            return intervals['custom']
    
    def should_provide_coaching(self, user_id: str, activity_type: str) -> bool:
        """Rate limiting for coaching feedback with activity-specific logic"""
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
                'phase': 'setup',
                'rep_count': 0,
                'last_feedback_time': None,
                'movement_detected': False,
                'squat_state': 'standing',
                'last_squat_position': None,
                'squat_depth_threshold': 0.08,
                'position_history': [],
                'jumping_jack_state': {'phase': 'down'},
                'last_api_call_time': 0,
                # Add frame buffer and batching state
                'frame_buffer': [], # Stores (frame_data, pose_data) for batch analysis
                'last_batch_time': 0,
                'reps_since_last_batch': 0
            }
        return self.user_states[user_id]
    
    def detect_movement_completion(self, pose_data: Dict[str, Any], activity_type: str) -> bool:
        """Detect when a rep/movement is completed based on pose analysis"""
        if not pose_data or 'landmarks' not in pose_data:
            return False
            
        landmarks = pose_data['landmarks']
        
        # Debug logging to see what activity we're detecting
        logger.info(f"🔍 Movement detection called for activity: '{activity_type}' with {len(landmarks)} landmarks")
        
        try:
            if activity_type.lower().find('squat') != -1:
                logger.info("🏋️ Using squat detection")
                return self._detect_squat_completion(landmarks)
            elif activity_type.lower().find('pushup') != -1 or activity_type.lower().find('push-up') != -1:
                logger.info("💪 Using pushup detection")
                return self._detect_pushup_completion(landmarks)
            elif activity_type.lower().find('jumping jack') != -1:
                logger.info("🤸 Using jumping jack detection")
                return self._detect_jumping_jack_completion(landmarks)
            elif activity_type.lower().find('basketball') != -1:
                logger.info("🏀 Using basketball detection")
                return self._detect_basketball_shot_completion(landmarks)
            elif activity_type.lower().find('tennis') != -1 or activity_type.lower().find('golf') != -1:
                logger.info("🎾 Using swing detection")
                return self._detect_swing_completion(landmarks)
            elif activity_type.lower().find('plank') != -1:
                logger.info("🏃 Using plank detection")
                return self._detect_plank_hold_completion(landmarks)
            else:
                # Generic movement detection
                logger.info(f"❓ Using generic detection for unknown activity: '{activity_type}'")
                return self._detect_generic_movement_completion(landmarks)
                        
        except (KeyError, IndexError, TypeError) as e:
            logger.warning(f"Error in movement detection for {activity_type}: {e}")
            
        return False

    def _detect_squat_completion(self, landmarks: List[Dict]) -> bool:
        """
        Detect squat completion by tracking the full down-up cycle
        Uses state machine to track: standing -> descending -> bottom -> ascending -> standing (COMPLETED)
        """
        if len(landmarks) < 28:
            return False
            
        try:
            # Get key landmarks for squat analysis
            left_hip = landmarks[23]
            right_hip = landmarks[24]
            left_knee = landmarks[25]
            right_knee = landmarks[26]
            left_ankle = landmarks[27] if len(landmarks) > 27 else None
            right_ankle = landmarks[28] if len(landmarks) > 28 else None
            
            if not (left_ankle and right_ankle):
                return False
            
            # Calculate position metrics
            hip_avg_y = (left_hip.get('y', 0) + right_hip.get('y', 0)) / 2
            knee_avg_y = (left_knee.get('y', 0) + right_knee.get('y', 0)) / 2
            ankle_avg_y = (left_ankle.get('y', 0) + right_ankle.get('y', 0)) / 2
            
            # Hip-to-knee distance (positive = hips above knees, negative = hips below knees)
            hip_knee_diff = knee_avg_y - hip_avg_y
            
            # Get or create state tracking for this detection cycle
            if not hasattr(self, '_squat_detection_state'):
                self._squat_detection_state = {
                    'current_state': 'standing',
                    'min_depth_reached': 0,
                    'position_history': []
                }
            
            state = self._squat_detection_state
            
            # Track position history for smoothing
            state['position_history'].append(hip_knee_diff)
            if len(state['position_history']) > 5:
                state['position_history'].pop(0)
            
            # Use average of recent positions to smooth detection
            avg_position = sum(state['position_history']) / len(state['position_history'])
            
            # State machine for squat detection
            if state['current_state'] == 'standing':
                # Looking for start of descent
                if avg_position < 0.02:  # Hips starting to drop below knee level
                    state['current_state'] = 'descending'
                    state['min_depth_reached'] = avg_position
                    print(f"🔽 Squat: Started descending (hip-knee diff: {avg_position:.3f})")
                    
            elif state['current_state'] == 'descending':
                # Track depth and look for bottom position
                state['min_depth_reached'] = min(state['min_depth_reached'], avg_position)
                
                if avg_position < -0.08:  # Good depth reached
                    state['current_state'] = 'bottom'
                    print(f"⬇️ Squat: Reached bottom, depth: {state['min_depth_reached']:.3f}")
                elif avg_position > 0.02:  # Started going back up without good depth
                    state['current_state'] = 'ascending'
                    print(f"🔼 Squat: Ascending (shallow, depth: {state['min_depth_reached']:.3f})")
                    
            elif state['current_state'] == 'bottom':
                # Look for start of ascent
                if avg_position > state['min_depth_reached'] + 0.03:  # Clear upward movement
                    state['current_state'] = 'ascending'
                    print(f"⬆️ Squat: Started ascending from depth {state['min_depth_reached']:.3f}")
                    
            elif state['current_state'] == 'ascending':
                # Look for return to standing position
                if avg_position > 0.05:  # Back to standing position
                    # Check if this was a valid squat (good depth)
                    if state['min_depth_reached'] < -0.08:
                        print(f"🎯 Squat COMPLETED! Depth: {state['min_depth_reached']:.3f} ✅")
                        # Reset state for next squat
                        state['current_state'] = 'standing'
                        state['min_depth_reached'] = 0
                        state['position_history'] = []
                        return True  # SQUAT COMPLETED!
                    else:
                        print(f"❌ Squat incomplete - insufficient depth: {state['min_depth_reached']:.3f} (need < -0.08)")
                        # Reset state - shallow squat doesn't count
                        state['current_state'] = 'standing'
                        state['min_depth_reached'] = 0
                        state['position_history'] = []
            
            return False  # No completed squat yet
            
        except (KeyError, TypeError) as e:
            logger.error(f"Error in squat detection: {e}")
            return False

    def _simple_squat_feedback(self, depth: float) -> str:
        """Generate heuristic squat feedback if AI fails (no generic fluff)"""
        depth_cm = round(abs(depth) * 100, 1)
        if depth < -0.15:
            depth_comment = f"Great depth (~{depth_cm}cm below knees)."
        elif depth < -0.08:
            depth_comment = f"Solid depth (~{depth_cm}cm). Aim a bit lower for full range."
        else:
            depth_comment = f"Depth was shallow (~{depth_cm}cm). Squat deeper next rep."

        torso_comment = "Keep chest upright" if depth < -0.08 else "Engage core to avoid leaning forward"
        return f"{depth_comment} {torso_comment}."

    def _detect_pushup_completion(self, landmarks: List[Dict]) -> bool:
        """Detect pushup completion using shoulder and wrist positions"""
        if len(landmarks) < 16:
            return False
            
        try:
            left_shoulder = landmarks[11]
            right_shoulder = landmarks[12]
            left_wrist = landmarks[15]
            right_wrist = landmarks[16]
            
            # Calculate average positions
            shoulder_avg_y = (left_shoulder.get('y', 0) + right_shoulder.get('y', 0)) / 2
            wrist_avg_y = (left_wrist.get('y', 0) + right_wrist.get('y', 0)) / 2
            
            # Pushup completed when shoulders are above wrists (up position)
            shoulder_wrist_diff = wrist_avg_y - shoulder_avg_y
            
            return shoulder_wrist_diff > 0.05  # Shoulders sufficiently above wrists
            
        except (KeyError, TypeError):
            return False

    def _detect_jumping_jack_completion(self, landmarks: List[Dict]) -> bool:
        """Detect jumping-jack rep completion with a simple two-phase state machine.

        Phase definitions (mirrors the frontend `detectJumpingJackCompletion`):
        1. DOWN  – starting/ending pose: arms down, legs together
        2. UP    – mid-jack pose: arms overhead, legs wide

        A rep is counted when the athlete transitions **UP → DOWN** (i.e. returns to the
        starting pose after having reached the fully stretched position).
        """

        if len(landmarks) < 30:
            return False

        try:
            # -------- Landmark extraction --------
            ls, rs = landmarks[11], landmarks[12]   # shoulders
            lw, rw = landmarks[15], landmarks[16]   # wrists
            lh, rh = landmarks[23], landmarks[24]   # hips
            la = landmarks[27] if len(landmarks) > 27 else None  # ankles
            ra = landmarks[28] if len(landmarks) > 28 else None

            if not (la and ra):
                return False

            # -------- Pose features --------
            # Arms are up if both wrists are above corresponding shoulders (lower y == higher)
            arms_up = (lw.get('y', 1) < ls.get('y', 1)) and (rw.get('y', 1) < rs.get('y', 1))

            # Legs wide if ankle separation clearly exceeds shoulder width
            shoulder_dist = abs(ls.get('x', 0) - rs.get('x', 0))
            ankle_dist = abs(la.get('x', 0) - ra.get('x', 0))
            legs_wide = ankle_dist > shoulder_dist * 1.5

            # Legs together if ankles roughly under hips (allow small variance)
            legs_together = ankle_dist < shoulder_dist * 1.2

            arms_down = not arms_up

            # -------- Simple state machine --------
            if not hasattr(self, '_jj_detection_state'):
                # Store last phase so we only count once per rep
                self._jj_detection_state = {
                    'phase': 'down'  # initial expected phase when session starts
                }

            state = self._jj_detection_state

            # Debug log (prints are OK for dev server)
            print(f"JJ detect | phase={state['phase']} arms_up={arms_up} legs_wide={legs_wide} legs_together={legs_together}")
            logger.info(f"🤸 JJ State: phase={state['phase']} | arms_up={arms_up} legs_wide={legs_wide} legs_together={legs_together}")

            if state['phase'] == 'down' and arms_up and legs_wide:
                # Transition: start jumping up
                state['phase'] = 'up'
                logger.info("🔼 JJ: Transitioned to UP phase")
                return False

            if state['phase'] == 'up' and arms_down and legs_together:
                # Completed the jack (returned to starting pose)
                state['phase'] = 'down'
                print("🎯 Jumping Jack COMPLETED! ✅")
                logger.info("🎯 Jumping Jack COMPLETED! ✅")
                return True

            return False

        except (KeyError, TypeError):
            return False

    def _detect_basketball_shot_completion(self, landmarks: List[Dict]) -> bool:
        """Detect basketball shot completion"""
        if len(landmarks) < 16:
            return False
            
        try:
            left_wrist = landmarks[15]
            right_wrist = landmarks[16]
            nose = landmarks[0]
            
            # Shot completed when both wrists are below nose level (arms down after shot)
            wrist_avg_y = (left_wrist.get('y', 0) + right_wrist.get('y', 0)) / 2
            nose_y = nose.get('y', 0)
            
            return wrist_avg_y > nose_y + 0.1  # Wrists clearly below nose
            
        except (KeyError, TypeError):
            return False

    def _detect_swing_completion(self, landmarks: List[Dict]) -> bool:
        """Detect tennis/golf swing completion"""
        if len(landmarks) < 16:
            return False
            
        try:
            left_wrist = landmarks[15]
            right_wrist = landmarks[16]
            left_shoulder = landmarks[11]
            right_shoulder = landmarks[12]
            
            # Swing completed when arms return to neutral position
            # Check if wrists are near shoulder level (resting position)
            shoulder_avg_y = (left_shoulder.get('y', 0) + right_shoulder.get('y', 0)) / 2
            wrist_avg_y = (left_wrist.get('y', 0) + right_wrist.get('y', 0)) / 2
            
            return abs(wrist_avg_y - shoulder_avg_y) < 0.15  # Wrists near shoulder level
            
        except (KeyError, TypeError):
            return False

    def _detect_plank_hold_completion(self, landmarks: List[Dict]) -> bool:
        """Detect plank hold completion (time-based)"""
        # For plank, we'd typically track time in proper position
        # This is a simplified version - in practice, you'd track duration
        if len(landmarks) < 16:
            return False
            
        try:
            # Check if body is in plank position
            left_shoulder = landmarks[11]
            right_shoulder = landmarks[12]
            left_hip = landmarks[23]
            right_hip = landmarks[24]
            
            # Body should be relatively straight
            shoulder_avg_y = (left_shoulder.get('y', 0) + right_shoulder.get('y', 0)) / 2
            hip_avg_y = (left_hip.get('y', 0) + right_hip.get('y', 0)) / 2
            
            # For demo purposes, return True occasionally to simulate hold completion
            body_straight = abs(shoulder_avg_y - hip_avg_y) < 0.1
            return body_straight and (time.time() % 10 < 1)  # Simulate 10-second holds
            
        except (KeyError, TypeError):
            return False

    def _detect_generic_movement_completion(self, landmarks: List[Dict]) -> bool:
        """Generic movement detection for unknown activities"""
        if len(landmarks) < 10:
            return False
            
        # Very basic detection - return True occasionally
        return time.time() % 8 < 1  # Simulate movement every 8 seconds
    
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
    
    async def analyze_live_frame(self, frame_data: str, activity_type: str, context: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze a live frame for real-time coaching, using batching to reduce API calls.
        """
        user_id = context.get('user_id', 'anonymous')
        pose_data = context.get('pose_data', {})
        current_time = context.get('timestamp', int(time.time() * 1000))
        user_state = self.get_user_state(user_id)

        # Always add the current frame to the buffer
        if frame_data:
            user_state['frame_buffer'].append(frame_data)
        
        # Trim buffer to keep it from growing too large (e.g., last 100 frames)
        if len(user_state['frame_buffer']) > 100:
            user_state['frame_buffer'].pop(0)

        movement_completed = self.detect_movement_completion(pose_data, activity_type)
        response_data = {
            'success': True,
            'movement_completed': False,
            'should_provide_feedback': False,
            'feedback': None
        }

        if movement_completed:
            user_state['rep_count'] += 1
            user_state['reps_since_last_batch'] += 1
            response_data.update({
                'movement_completed': True,
                'rep_count': user_state['rep_count']
            })

            # --- Batching Logic ---
            # Condition 1: Rep-based trigger (e.g., every 5 reps)
            rep_trigger = user_state['reps_since_last_batch'] >= 5
            # Condition 2: Time-based trigger (e.g., every 7 seconds)
            time_trigger = (current_time - user_state.get('last_batch_time', 0)) > 7000
            
            # If either trigger is met and we have frames, process the batch
            if (rep_trigger or time_trigger) and user_state['frame_buffer']:
                logger.info(f"✅ Batch trigger met for user {user_id}: {user_state['reps_since_last_batch']} reps, {(current_time - user_state.get('last_batch_time', 0)) / 1000}s elapsed.")
                
                # Use a subset of frames to avoid sending too much data (e.g., 5 frames)
                frames_for_analysis = user_state['frame_buffer'][-5:]
                
                prompt = self.get_activity_prompt(activity_type, user_state['rep_count'], 'rep_group_analysis')
                
                try:
                    feedback = await self.gemini_service.analyze_video_frames(frames_for_analysis, prompt)
                    
                    response_data.update({
                        'should_provide_feedback': True,
                        'feedback': feedback,
                        'feedback_type': 'batch_analysis'
                    })
                    logger.info(f"🧠 AI batch feedback generated for {activity_type}")

                except Exception as e:
                    logger.error(f"Error during batched Gemini analysis: {e}")
                    # Use heuristic fallback if AI fails
                    feedback = self._simple_jumping_jack_feedback(user_state['rep_count'])
                    response_data.update({
                        'should_provide_feedback': True,
                        'feedback': feedback,
                        'feedback_type': 'heuristic_fallback'
                    })

                # Reset batch state
                user_state['frame_buffer'] = []
                user_state['reps_since_last_batch'] = 0
                user_state['last_batch_time'] = current_time

        return response_data

    def analyze_complete_rep(self, activity_type: str, rep_data: Dict[str, Any], user_context: Dict[str, Any]) -> str:
        """
        Analyze a complete rep and provide expert coaching feedback - ONLY AI GENERATED
        
        Args:
            activity_type: Type of exercise/activity
            rep_data: Complete rep data including phases, landmarks, scores
            user_context: User session context (total reps, performance trends)
        
        Returns:
            Expert coaching feedback string (AI generated only)
        """
        try:
            # Get expert coaching prompt
            prompt = self.get_complete_rep_prompt(activity_type, rep_data, user_context)
            
            # Use AI analysis ONLY - no fallback to pre-written messages
            response = self.gemini_service.analyze_movement_data(prompt, rep_data)
            
            if response and len(response.strip()) > 0:
                return response
            else:
                # Return empty rather than fallback - let calling code handle
                return ""
                
        except Exception as e:
            logger.error(f"Error analyzing complete rep: {e}")
            return ""  # Empty string instead of fallback message
    
    def get_complete_rep_prompt(self, activity_type: str, rep_data: Dict[str, Any], user_context: Dict[str, Any]) -> str:
        """Generate expert prompt for complete rep analysis"""
        
        rep_number = rep_data.get('number', 1)
        form_score = rep_data.get('formScore', 80)
        phases = rep_data.get('phases', [])
        
        base_prompt = f"""
        You are a world-class expert coach analyzing a complete {activity_type} rep. 
        
        REP DATA:
        - Rep #{rep_number}
        - Form Score: {form_score}%
        - Phases: {len(phases)} movement phases detected
        - Duration: {rep_data.get('endTime', 0) - rep_data.get('startTime', 0)}ms
        
        USER CONTEXT:
        - Total reps this session: {user_context.get('totalReps', 0)}
        - Overall performance: {user_context.get('recentPerformance', 0)}%
        
        INSTRUCTIONS:
        Give specific, actionable feedback on this complete rep like a top-tier personal trainer would.
        Focus on what they did right/wrong in this exact rep and immediate corrections for next rep.
        
        Keep response to 1-2 sentences MAX (for voice coaching).
        Be encouraging but specific about improvements.
        """
        
        # Activity-specific coaching focus
        activity_prompts = {
            'jumping jacks': """
            JUMPING JACKS ANALYSIS:
            - Coordination: Arms and legs moving together
            - Range of motion: Full extension overhead and feet wide
            - Landing control: Soft, controlled landings
            - Rhythm: Consistent tempo throughout
            
            Example feedback: "Great coordination! Your arms reached full extension. Try landing a bit softer on your feet next rep."
            """,
            
            'squat form check': """
            SQUAT ANALYSIS:
            - Depth: Hip crease below knee level
            - Knee tracking: Knees in line with toes, no valgus
            - Back position: Neutral spine, chest up
            - Weight distribution: Balanced on whole foot
            
            Example feedback: "Excellent depth! Your knees tracked well. Keep your chest up more throughout the movement."
            """,
            
            'push-up technique': """
            PUSH-UP ANALYSIS:
            - Body alignment: Straight line head to heels
            - Range of motion: Chest close to ground
            - Elbow position: 45-degree angle, not flared
            - Control: Smooth up and down movement
            
            Example feedback: "Perfect body alignment! Your range of motion was excellent. Try keeping elbows slightly closer to your body."
            """,
            
            'basketball shooting': """
            BASKETBALL ANALYSIS:
            - Shooting form: Elbow alignment, follow-through
            - Base: Balanced stance, proper foot positioning
            - Arc: Consistent release angle
            - Timing: Smooth rhythm from catch to release
            
            Example feedback: "Good shooting base! Nice follow-through. Work on consistent elbow alignment for better accuracy."
            """,
            
            'tennis practice': """
            TENNIS ANALYSIS:
            - Swing mechanics: Racket path, contact point
            - Footwork: Positioning and balance
            - Follow-through: Complete extension
            - Timing: Contact point consistency
            
            Example feedback: "Solid swing mechanics! Good contact point. Try stepping into the shot more for extra power."
            """,
            
            'golf swing': """
            GOLF ANALYSIS:
            - Stance: Balanced setup, proper alignment
            - Swing plane: Consistent path throughout
            - Tempo: Smooth rhythm, not rushed
            - Contact: Clean strike, proper impact position
            
            Example feedback: "Nice swing tempo! Great balance throughout. Focus on keeping your head steady during the swing."
            """
        }
        
        activity_prompt = activity_prompts.get(activity_type, """
        GENERAL MOVEMENT ANALYSIS:
        - Form quality: Proper technique execution
        - Control: Smooth, controlled movement
        - Range of motion: Full movement completion
        - Consistency: Maintaining quality throughout
        
        Example feedback: "Good movement control! Nice form throughout. Focus on maintaining this quality in your next rep."
        """)
        
        return base_prompt + activity_prompt
    
    def get_activity_feedback_strategy(self, activity_type: str) -> str:
        """Determine feedback strategy based on activity type"""
        activity_lower = activity_type.lower()
        
        if 'plank' in activity_lower or 'wall sit' in activity_lower:
            return 'continuous_hold'  # Form feedback during holds
        elif 'golf' in activity_lower or 'tennis' in activity_lower:
            return 'per_swing'       # Analyze each complete swing
        elif any(term in activity_lower for term in ['pushup', 'push-up', 'push up', 'squat', 'jumping jack']):
            return 'rep_groups'      # Group multiple reps for analysis
        elif 'basketball' in activity_lower:
            return 'per_attempt'     # Each shot attempt
        else:
            return 'general'         # Default strategy
    
    def get_live_coaching_prompt(self, activity_type: str, feedback_strategy: str, user_state: Dict[str, Any]) -> str:
        """Generate activity-specific coaching prompts for real-time feedback"""
        rep_count = user_state.get('reps_completed', 0)
        
        if feedback_strategy == 'continuous_hold':
            # For plank, wall sit, etc.
            return f"""
            You are an expert fitness coach providing real-time form feedback for {activity_type}.
            
            The user is currently holding the {activity_type} position. Analyze their form and provide:
            - Brief (10-15 words) encouragement or form correction
            - Focus on core stability, alignment, and breathing
            - Keep the user motivated during the hold
            - Avoid repetitive feedback
            
            Current hold duration: {rep_count * 8} seconds
            
            Provide specific, actionable feedback based on what you see in the video frame.
            """
            
        elif feedback_strategy == 'per_swing':
            # For golf, tennis
            return f"""
            You are an expert {activity_type} coach providing real-time swing analysis.
            
            Analyze the user's current posture and swing technique. Provide:
            - Brief (15-20 words) technical feedback
            - Focus on stance, swing plane, balance, tempo
            - If you can see a golf club, comment on grip and club position
            - If you cannot clearly see a club, focus on body mechanics and setup
            - Specific corrections for improvement
            - Professional coaching tone
            
            Swing number: {rep_count + 1}
            
            Provide expert coaching feedback based on what you can observe in the video frame.
            """
            
        elif feedback_strategy == 'rep_groups':
            # For pushups, squats, etc.
            return f"""
            You are an expert strength coach providing real-time form feedback for {activity_type}.
            
            The user is performing {activity_type} exercises. Analyze their current form and provide:
            - Brief (10-15 words) form correction or encouragement
            - Focus on proper range of motion, alignment, and control
            - Motivational but corrective feedback
            - Specific technique tips
            
            Current rep: {rep_count + 1}
            
            Provide specific feedback based on their current movement quality.
            """
            
        elif feedback_strategy == 'per_attempt':
            # For basketball
            return f"""
            You are an expert basketball shooting coach providing real-time feedback.
            
            The user just attempted a shot. Analyze their shooting form and provide:
            - Brief (15-20 words) technical feedback
            - Focus on shooting mechanics, follow-through, balance
            - Specific improvements for next shot
            - Encouraging but instructive tone
            
            Shot attempt: {rep_count + 1}
            
            Analyze their shooting form and provide coaching feedback.
            """
            
        else:
            # General strategy
            return f"""
            You are an expert fitness coach providing real-time feedback for {activity_type}.
            
            Analyze the user's current form and movement. Provide:
            - Brief (10-15 words) feedback
            - Focus on proper technique and safety
            - Encouraging and motivational tone
            - Specific, actionable advice
            
            Movement count: {rep_count + 1}
            
            Provide helpful coaching feedback based on what you observe.
            """

    def _simple_jumping_jack_feedback(self, rep_count: int) -> str:
        """Generate heuristic jumping jack feedback if AI fails (no generic fluff)"""
        feedback_options = [
            f"Rep {rep_count} completed! Keep your arms straight overhead.",
            f"Good jack #{rep_count}! Land softer on your feet next time.",
            f"Rep {rep_count} done! Sync your arm and leg movements better.",
            f"Jack #{rep_count} complete! Jump higher and spread legs wider.",
            f"Rep {rep_count} finished! Keep your core tight throughout."
        ]
        return feedback_options[(rep_count - 1) % len(feedback_options)]

    def get_activity_prompt(self, activity_type: str, rep_count: int, prompt_type: str) -> str:
        """Get a specific prompt for the activity and context."""
        
        base_prompt = f"You are an expert AI fitness coach for {activity_type}."

        if prompt_type == 'rep_group_analysis':
            return f"""
                {base_prompt}
                
                You are analyzing a batch of frames covering the last 5 reps.
                The user has completed {rep_count} total reps.
                
                Analyze the sequence of images to identify the most important form correction the user should make.
                Provide a single, concise, and actionable tip (15-20 words).
                
                - Focus on the biggest mistake or area for improvement.
                - Do not comment on good form, only corrections.
                - Do not use generic encouragement.
                - Frame the feedback constructively for the next set of reps.

                Example: "Great effort on those reps. For the next set, focus on keeping your elbows closer to your body during the push-up."
            """
        
        # ... (other prompt types can be added here)

        return f"{base_prompt} Provide general feedback."