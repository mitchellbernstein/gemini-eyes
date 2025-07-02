"""
Activity templates for AI analysis
"""

ACTIVITY_TEMPLATES = [
    {
        "id": "basketball_shooting",
        "name": "Basketball Shooting",
        "icon": "🏀",
        "description": "Analyze shooting form and technique",
        "prompt": """
        Analyze this basketball shooting form video. Focus on:
        1. Shooting stance and balance
        2. Elbow alignment under the ball
        3. Follow-through and wrist snap
        4. Arc and trajectory of the shot
        5. Overall shooting mechanics
        
        Provide specific, actionable feedback on what's done well and what needs improvement. 
        Be encouraging but precise in your technical analysis.
        """,
        "tracking_points": ["shoulders", "elbows", "wrists", "knees"],
        "category": "sports"
    },
    {
        "id": "squat_form",
        "name": "Squat Form Check",
        "icon": "🏋️",
        "description": "Check your squat depth and posture", 
        "prompt": """
        Analyze this squat exercise form. Focus on:
        1. Depth - are they reaching proper depth (hip crease below knee)?
        2. Knee alignment - knees tracking over toes, not caving in
        3. Back posture - maintaining neutral spine, chest up
        4. Weight distribution - balanced on feet
        5. Hip hinge movement pattern
        
        Give clear feedback on form corrections needed and what's being done correctly.
        Focus on safety and proper technique.
        """,
        "tracking_points": ["hips", "knees", "ankles", "shoulders"],
        "category": "fitness"
    },
    {
        "id": "pushup_technique",
        "name": "Push-up Technique",
        "icon": "💪", 
        "description": "Perfect your push-up form",
        "prompt": """
        Analyze this push-up exercise form. Focus on:
        1. Body alignment - straight line from head to heels
        2. Hand placement - proper width and position
        3. Range of motion - full descent to chest nearly touching ground
        4. Core engagement - no sagging hips or arched back
        5. Controlled movement - smooth up and down motion
        
        Provide specific feedback on form improvements and highlight good technique.
        Focus on building strength safely.
        """,
        "tracking_points": ["shoulders", "elbows", "hips", "knees"],
        "category": "fitness"
    },
    {
        "id": "jumping_jacks",
        "name": "Jumping Jacks",
        "icon": "🤸",
        "description": "Perfect your jumping jack form and rhythm",
        "prompt": """
        Analyze this jumping jack exercise form. Focus on:
        1. Arm movement - full overhead reach and smooth lowering
        2. Leg coordination - wide stance landing, feet together return
        3. Landing mechanics - soft landings on balls of feet
        4. Rhythm and timing - consistent pace throughout
        5. Core engagement - stable torso, no excessive bouncing
        6. Breathing pattern - coordinated with movement
        
        Provide feedback on coordination, form, and cardiovascular efficiency.
        Focus on proper technique to maximize benefits and prevent injury.
        """,
        "tracking_points": ["shoulders", "elbows", "hips", "knees", "ankles"],
        "category": "fitness"
    },
    {
        "id": "running_form",
        "name": "Running Form",
        "icon": "🏃",
        "description": "Improve your running technique and efficiency",
        "prompt": """
        Analyze this running form and technique. Focus on:
        1. Foot strike - midfoot landing under center of gravity
        2. Cadence - optimal step rate (around 180 steps/minute)
        3. Posture - slight forward lean, relaxed shoulders
        4. Arm swing - 90-degree angle, natural pendulum motion
        5. Stride length - efficient, not overstriding
        6. Head position - looking ahead, not down
        
        Give detailed feedback on running efficiency and injury prevention.
        Focus on sustainable, biomechanically sound technique.
        """,
        "tracking_points": ["head", "shoulders", "elbows", "hips", "knees", "ankles"],
        "category": "fitness"
    },
    {
        "id": "deadlift_form",
        "name": "Deadlift Technique",
        "icon": "🏋️‍♂️",
        "description": "Master proper deadlift form and safety",
        "prompt": """
        Analyze this deadlift exercise form. Focus on:
        1. Starting position - hip hinge, neutral spine, chest up
        2. Grip - secure hold, arms straight
        3. Bar path - straight line close to body
        4. Hip drive - power from glutes and hamstrings
        5. Lockout - full hip extension, shoulders back
        6. Controlled descent - same path down
        
        Provide specific feedback on form, safety, and power generation.
        Focus on preventing injury and maximizing strength development.
        """,
        "tracking_points": ["shoulders", "hips", "knees", "ankles"],
        "category": "fitness"
    },
    {
        "id": "plank_hold",
        "name": "Plank Hold",
        "icon": "🧘‍♂️",
        "description": "Check your plank form and core engagement",
        "prompt": """
        Analyze this plank exercise form. Focus on:
        1. Body alignment - straight line from head to heels
        2. Core engagement - tight abdominals, no sagging
        3. Shoulder position - directly over wrists/elbows
        4. Neck alignment - neutral spine, looking down
        5. Breathing - maintaining form while breathing normally
        6. Duration vs. form - quality over quantity
        
        Give feedback on core engagement and overall stability.
        Focus on building functional core strength safely.
        """,
        "tracking_points": ["head", "shoulders", "hips", "knees"],
        "category": "fitness"
    },
    {
        "id": "pullup_technique",
        "name": "Pull-up Technique",
        "icon": "🔺",
        "description": "Perfect your pull-up form and strength",
        "prompt": """
        Analyze this pull-up exercise form. Focus on:
        1. Grip - secure hold, proper width
        2. Starting position - full hang, shoulders engaged
        3. Pull motion - leading with chest, elbows down and back
        4. Range of motion - chin over bar, full control
        5. Descent - controlled negative, full extension
        6. Body position - minimal swinging, core engaged
        
        Provide feedback on strength building and proper mechanics.
        Focus on progressive development and injury prevention.
        """,
        "tracking_points": ["shoulders", "elbows", "wrists", "hips"],
        "category": "fitness"
    },
    {
        "id": "burpee_form",
        "name": "Burpee Technique",
        "icon": "💥",
        "description": "Master the perfect burpee movement",
        "prompt": """
        Analyze this burpee exercise form. Focus on:
        1. Squat down - controlled descent, hands to floor
        2. Jump back - smooth transition to plank position
        3. Push-up - proper form if included
        4. Jump forward - feet to hands, athletic position
        5. Jump up - explosive vertical jump with arms overhead
        6. Flow - smooth transitions between each phase
        
        Give feedback on movement quality and cardiovascular efficiency.
        Focus on maintaining form while working at high intensity.
        """,
        "tracking_points": ["shoulders", "elbows", "hips", "knees", "ankles"],
        "category": "fitness"
    },
    {
        "id": "tennis_serve",
        "name": "Tennis Serve",
        "icon": "🎾",
        "description": "Improve your tennis serve technique",
        "prompt": """
        Analyze this tennis serve technique. Focus on:
        1. Ball toss - consistent placement and height
        2. Racquet preparation and backswing
        3. Contact point - reaching up for the ball
        4. Follow-through and finish
        5. Body rotation and weight transfer
        6. Overall rhythm and timing
        
        Give detailed feedback on serve mechanics and suggest specific improvements.
        Focus on power, accuracy, and consistent technique.
        """,
        "tracking_points": ["shoulders", "elbows", "wrists", "hips"],
        "category": "sports"
    },
    {
        "id": "golf_swing",
        "name": "Golf Swing",
        "icon": "⛳",
        "description": "Analyze your golf swing mechanics with real-time swing detection",
        "prompt": """
        You are an AI golf instructor analyzing real-time golf swing data. Focus on providing specific, actionable feedback for each detected swing.

        For SWING DETECTION, look for:
        - Golf club in frame (long object in hands)
        - Proper golf stance (feet shoulder-width apart, knees slightly bent, bent at waist)
        - Swing motion (backswing, downswing, follow-through sequence)
        
        For STANCE ANALYSIS when no swing is detected:
        - Foot positioning and weight distribution
        - Posture (spine angle, knee flex, arm hang)
        - Club grip and setup position
        - Ball position relative to stance
        
        For SWING ANALYSIS when swing is detected:
        - Backswing: Club path, shoulder rotation, weight shift
        - Transition: Timing and sequence of downswing
        - Impact: Club face angle, body position
        - Follow-through: Balance and finish position
        
        IMPORTANT: 
        - Only give stance feedback when person is in proper golf address position
        - Count and analyze each complete swing separately
        - Detect golf club presence and alert if not visible
        - Provide specific, technical feedback based on what you actually see
        - Be encouraging but precise in corrections needed
        
        NEVER give generic "great posture" feedback unless the person is actually in proper golf stance.
        """,
        "tracking_points": ["shoulders", "elbows", "wrists", "hips", "knees"],
        "category": "sports",
        "swing_detection": True,
        "requires_equipment": ["golf_club"]
    },
    {
        "id": "boxing_punches",
        "name": "Boxing Technique",
        "icon": "🥊",
        "description": "Perfect your boxing form and power",
        "prompt": """
        Analyze this boxing technique. Focus on:
        1. Stance - balanced, athletic position, guard up
        2. Punch mechanics - proper form for jabs, crosses, hooks
        3. Hip rotation - power generation from core
        4. Footwork - movement, balance, positioning
        5. Defense - head movement, guard position
        6. Combination flow - smooth transitions between punches
        
        Give feedback on technique, power generation, and defensive positioning.
        Focus on proper form for both offense and defense.
        """,
        "tracking_points": ["shoulders", "elbows", "wrists", "hips", "knees"],
        "category": "martial_arts"
    },
    {
        "id": "yoga_poses",
        "name": "Yoga Poses",
        "icon": "🧘",
        "description": "Check your yoga alignment and form",
        "prompt": """
        Analyze this yoga pose and alignment. Focus on:
        1. Alignment - proper joint stacking and positioning
        2. Balance - stability and weight distribution
        3. Flexibility - appropriate range of motion
        4. Breathing - maintaining breath with the pose
        5. Modifications - safe adjustments for your level
        6. Mindfulness - present awareness and relaxation
        
        Provide feedback on alignment, safety, and mindful practice.
        Focus on sustainable practice and injury prevention.
        """,
        "tracking_points": ["head", "shoulders", "elbows", "hips", "knees", "ankles"],
        "category": "wellness"
    },
    {
        "id": "volleyball_spike",
        "name": "Volleyball Spike",
        "icon": "🏐",
        "description": "Perfect your volleyball attack technique",
        "prompt": """
        Analyze this volleyball spike technique. Focus on:
        1. Approach - timing, footwork, acceleration
        2. Jump - vertical leap, arm swing for momentum
        3. Contact point - hitting at highest point
        4. Arm swing - full extension, snap at contact
        5. Follow-through - controlled landing
        6. Timing - coordination with setter and ball
        
        Give detailed feedback on attack power and accuracy.
        Focus on timing, power generation, and consistent technique.
        """,
        "tracking_points": ["shoulders", "elbows", "wrists", "hips", "knees", "ankles"],
        "category": "sports"
    },
    {
        "id": "swimming_stroke",
        "name": "Swimming Technique",
        "icon": "🏊",
        "description": "Improve your swimming stroke efficiency",
        "prompt": """
        Analyze this swimming stroke technique. Focus on:
        1. Body position - streamlined, horizontal alignment
        2. Arm stroke - catch, pull, recovery phases
        3. Kick - consistent, from hips, minimal splash
        4. Breathing - rhythmic, bilateral if applicable
        5. Timing - coordination of arms and legs
        6. Efficiency - distance per stroke, smooth rhythm
        
        Provide feedback on stroke efficiency and technique.
        Focus on speed, endurance, and proper mechanics.
        """,
        "tracking_points": ["shoulders", "elbows", "wrists", "hips", "knees"],
        "category": "sports"
    },
    {
        "id": "dance_moves",
        "name": "Dance Technique",
        "icon": "💃",
        "description": "Perfect your dance moves and rhythm",
        "prompt": """
        Analyze this dance technique and performance. Focus on:
        1. Rhythm - staying on beat, musical interpretation
        2. Coordination - smooth movement transitions
        3. Posture - proper alignment and core engagement
        4. Expression - emotional connection to music
        5. Technique - clean execution of specific moves
        6. Flow - natural, graceful movement quality
        
        Give feedback on technique, musicality, and performance quality.
        Focus on artistic expression and technical precision.
        """,
        "tracking_points": ["head", "shoulders", "elbows", "hips", "knees", "ankles"],
        "category": "dance"
    },
    {
        "id": "knife_skills",
        "name": "Knife Skills",
        "icon": "🔪",
        "description": "Master proper knife technique and safety",
        "prompt": """
        Analyze this knife cutting technique. Focus on:
        1. Grip - proper claw grip with non-cutting hand
        2. Knife angle and blade contact with cutting board
        3. Cutting motion - smooth, controlled movements
        4. Safety - finger position and cutting stability
        5. Consistency - uniform cuts and pieces
        6. Efficiency of movement
        
        Provide feedback on technique, safety, and efficiency improvements.
        Focus on building safe, professional knife skills.
        """,
        "tracking_points": ["hands", "wrists", "fingers"],
        "category": "cooking"
    }
]

def get_template_by_id(template_id):
    """Get template by ID"""
    for template in ACTIVITY_TEMPLATES:
        if template['id'] == template_id:
            return template
    return None

def get_templates_by_category(category=None):
    """Get templates by category, or all if no category specified"""
    if not category:
        return ACTIVITY_TEMPLATES
    return [t for t in ACTIVITY_TEMPLATES if t['category'] == category] 