# Motion Mentor - AI Activity Analysis Platform

An ultra-simple web app that provides instant AI feedback on any activity using Google's Gemini Vision API. Built for both desktop and mobile with a mobile-first approach.

## ✨ Features

- **Google Sign-In** - Simple authentication to prevent spam
- **5 Pre-built Templates** - Basketball, Squat Form, Push-ups, Tennis Serve, Knife Skills  
- **Custom Prompts** - Analyze any activity with your own description
- **Mobile-First PWA** - Works perfectly on phones and can be installed
- **30-Second Recording** - Quick video capture with real-time feedback
- **Rate Limiting** - 50 analyses/day, 10/hour per user
- **Privacy-First** - Videos analyzed once and never stored

## 🚀 Quick Start

### Backend Setup

1. **Install Dependencies**
```bash
cd backend
pip install -r requirements.txt
```

2. **Environment Variables**
```bash
cp .env.example .env
# Edit .env with your API keys:
# - GOOGLE_CLIENT_ID
# - GOOGLE_CLIENT_SECRET  
# - GEMINI_API_KEY
```

3. **Database Setup**
```bash
python manage.py makemigrations
python manage.py migrate
python manage.py createsuperuser
```

4. **Run Server**
```bash
python manage.py runserver
```

### Frontend Setup

1. **Install Dependencies**
```bash
cd frontend
npm install
```

2. **Environment Variables**
```bash
cp .env.example .env.local
# Edit with your values:
# - NEXT_PUBLIC_GOOGLE_CLIENT_ID
# - NEXT_PUBLIC_API_URL
```

3. **Run Development Server**
```bash
npm run dev
```

## 🏗️ Architecture

### Backend (Django)
- **Authentication**: Google OAuth with custom middleware
- **Rate Limiting**: Per-user limits with automatic reset
- **Video Processing**: OpenCV frame extraction
- **AI Integration**: Gemini Vision API for analysis
- **Templates**: Pre-built prompts for common activities

### Frontend (Next.js PWA)
- **Mobile-First**: Responsive design optimized for phones
- **PWA Features**: Installable, offline-capable
- **Camera Integration**: Native video recording
- **Real-time UI**: Smooth animations and feedback

## 📱 User Flow

1. **Sign In** - One-click Google OAuth
2. **Pick Activity** - Choose template or custom prompt
3. **Record Video** - 30-second mobile recording
4. **Get Feedback** - AI analysis with actionable insights

## 🔧 API Endpoints

- `GET /api/health/` - Health check
- `GET /api/templates/` - Activity templates
- `GET /api/user/limits/` - Rate limit status
- `POST /api/analyze/` - Video analysis
- `POST /api/auth/verify/` - Token verification

## 📋 Templates

1. **Basketball Shooting** - Form analysis and technique tips
2. **Squat Form Check** - Depth, alignment, safety feedback  
3. **Push-up Technique** - Body alignment and range of motion
4. **Tennis Serve** - Toss, contact, follow-through analysis
5. **Knife Skills** - Grip, motion, safety for cooking

## 🚀 Deployment

### Backend
```bash
# Production settings
export DEBUG=False
export DOMAIN=yourdomain.com

# Run with Gunicorn
gunicorn gemini_eyes.wsgi:application
```

### Frontend
```bash
# Build for production
npm run build
npm start
```

## 🔐 Security Features

- **Google OAuth** - Verified user authentication
- **Rate Limiting** - Prevents API abuse
- **CORS Protection** - Secure cross-origin requests
- **Input Validation** - File size/type/duration limits
- **No Data Storage** - Videos processed and discarded

## 💡 Future Enhancements

- **More Templates** - Golf, yoga, dancing, presentations
- **Social Features** - Share analysis, coach accounts  
- **Advanced Analytics** - Progress tracking over time
- **Voice Feedback** - Audio analysis instructions
- **Multi-language** - Support for different languages

## 📄 License

MIT License - feel free to use and modify as needed.

---

Built with ❤️ using Django, Next.js, and Google Gemini AI
