# 🚀 Motion Mentor Setup Instructions

## Prerequisites

1. **Python 3.8+** - [Download here](https://www.python.org/downloads/)
2. **Node.js 18+** - [Download here](https://nodejs.org/)
3. **Google Cloud Account** - For OAuth and API keys
4. **Gemini API Key** - Get from [Google AI Studio](https://makersuite.google.com/app/apikey)

## 🔑 API Setup

### 1. Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable "Google+ API" and "People API"
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Configure OAuth consent screen
6. Add authorized origins:
   - `http://localhost:3000`
   - `http://localhost:8000`
7. Copy the Client ID and Client Secret

### 2. Gemini API Key

1. Visit [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create a new API key
3. Copy the key for later use

## 🛠️ Installation

### Option 1: Quick Setup (Recommended)

```bash
# Clone the repository
git clone <your-repo-url>
cd motion-mentor

# Make setup script executable
chmod +x run_app.sh

# Run setup script
./run_app.sh
```

### Option 2: Manual Setup

#### Backend Setup

```bash
cd backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
```

Edit `.env` with your values:
```env
SECRET_KEY=your-django-secret-key-here
DEBUG=True
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GEMINI_API_KEY=your-gemini-api-key
FRONTEND_URL=http://localhost:3000
```

```bash
# Run migrations
python manage.py makemigrations
python manage.py migrate

# Create admin user (optional)
python manage.py createsuperuser

# Start server
python manage.py runserver
```

#### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

Edit `.env.local` with your values:
```env
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
NEXT_PUBLIC_API_URL=http://localhost:8000
```

```bash
# Start development server
npm run dev
```

## 🧪 Testing

1. Open http://localhost:3000
2. Click "Continue with Google"
3. Sign in with your Google account
4. Try the "Basketball Shooting" template
5. Record a 10-second video
6. Wait for AI analysis

## 📱 Mobile Testing

1. Find your local IP address:
   ```bash
   # macOS/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1
   
   # Windows
   ipconfig | findstr "IPv4"
   ```

2. Update your environment files with your IP:
   ```env
   # .env.local
   NEXT_PUBLIC_API_URL=http://YOUR_IP:8000
   ```

3. Access the app on your phone at `http://YOUR_IP:3000`

## 🐛 Troubleshooting

### Common Issues

**1. CORS Errors**
- Check that `FRONTEND_URL` in backend `.env` matches your frontend URL
- Ensure both servers are running

**2. Google OAuth Not Working**
- Verify your Client ID is correct in both backend and frontend
- Check that your domain is added to Google OAuth authorized origins
- Make sure you're using the correct environment (development vs production)

**3. Gemini API Errors**
- Confirm your API key is valid and has proper permissions
- Check that you're not exceeding rate limits
- Verify your Google Cloud project has billing enabled

**4. Camera Not Working**
- Ensure you're accessing the app via HTTPS (required for camera on mobile)
- Check camera permissions in your browser
- Try both front and back cameras

**5. Database Issues**
```bash
# Reset database if needed
cd backend
rm db.sqlite3
python manage.py makemigrations
python manage.py migrate
```

### Performance Tips

1. **For Development:**
   - Use Chrome DevTools to simulate mobile devices
   - Enable "Slow 3G" to test video upload performance
   - Check Network tab for API response times

2. **For Production:**
   - Use a proper database (PostgreSQL)
   - Enable Redis for caching
   - Set up proper file storage (AWS S3)
   - Use a CDN for static assets

## 🚀 Deployment

### Backend (Django)

```bash
# Set production environment variables
export DEBUG=False
export DOMAIN=yourdomain.com
export DATABASE_URL=your-production-db-url

# Install production dependencies
pip install gunicorn

# Run with Gunicorn
gunicorn gemini_eyes.wsgi:application
```

### Frontend (Next.js)

```bash
# Build for production
npm run build

# Start production server
npm start
```

## 📞 Support

If you encounter issues:

1. Check the console for error messages
2. Verify all environment variables are set correctly
3. Ensure all services (Django, Next.js) are running
4. Test API endpoints directly using curl or Postman
5. Check that your Google Cloud and Gemini API quotas aren't exceeded

## 🔒 Security Notes

- Never commit `.env` files to version control
- Use environment-specific OAuth domains
- Enable rate limiting in production
- Set up proper HTTPS certificates
- Regularly update dependencies

---

Happy coding! 🎉 