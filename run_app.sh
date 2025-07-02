#!/bin/bash

# Motion Mentor - Development Setup Script
echo "🚀 Starting Motion Mentor Development Environment"

# Check if Python and Node are installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    exit 1
fi

# Setup Backend
echo "📋 Setting up Django backend..."
cd backend

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "🔧 Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "📦 Installing Python dependencies..."
pip install -r requirements.txt

# Check for .env file
if [ ! -f ".env" ]; then
    echo "⚠️  No .env file found. Please create one from .env.example"
    echo "📄 Required environment variables:"
    echo "   - SECRET_KEY"
    echo "   - GOOGLE_CLIENT_ID" 
    echo "   - GOOGLE_CLIENT_SECRET"
    echo "   - GEMINI_API_KEY"
    exit 1
fi

# Run migrations
echo "🗄️  Running database migrations..."
python manage.py makemigrations
python manage.py migrate

# Create superuser if needed
echo "👤 Django admin available at http://localhost:8000/admin/"
echo "   Run 'python manage.py createsuperuser' to create admin account"

# Start Django in background
echo "🟢 Starting Django server..."
python manage.py runserver &
DJANGO_PID=$!

# Setup Frontend
echo "📱 Setting up Next.js frontend..."
cd ../frontend

# Install dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node.js dependencies..."
    npm install
fi

# Check for .env.local file
if [ ! -f ".env.local" ]; then
    echo "⚠️  No .env.local file found. Please create one from .env.example"
    echo "📄 Required environment variables:"
    echo "   - NEXT_PUBLIC_GOOGLE_CLIENT_ID"
    echo "   - NEXT_PUBLIC_API_URL"
    exit 1
fi

# Start Next.js
echo "🟢 Starting Next.js development server..."
npm run dev &
NEXTJS_PID=$!

# Show status
echo ""
echo "✅ Motion Mentor is running!"
echo "🌐 Frontend: http://localhost:3000"
echo "🔧 Backend API: http://localhost:8000"
echo "⚙️  Admin Panel: http://localhost:8000/admin/"
echo ""
echo "📝 To stop the servers:"
echo "   kill $DJANGO_PID $NEXTJS_PID"
echo ""

# Wait for user to stop
echo "Press Ctrl+C to stop both servers..."
wait 