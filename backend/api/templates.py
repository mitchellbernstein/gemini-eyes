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