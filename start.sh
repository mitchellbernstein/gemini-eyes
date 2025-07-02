#!/bin/bash

echo "🚀 Starting Gemini Eyes App..."

# Kill existing processes on ports 8000 and 3000
echo "🧹 Cleaning up existing processes..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Wait a moment for cleanup
sleep 2

# Start Django Backend
echo "🔧 Starting Django backend on http://localhost:8000..."
cd backend
source venv/bin/activate
python manage.py runserver 8000 &
DJANGO_PID=$!

# Wait for Django to start
sleep 3

# Start Next.js Frontend  
echo "🌐 Starting Next.js frontend on http://localhost:3000..."
cd ../frontend
npm run dev -- --port 3000 &
NEXTJS_PID=$!

# Wait for frontend to start
sleep 3

echo ""
echo "✅ Both servers are starting up!"
echo "🌐 Frontend: http://localhost:3000" 
echo "🔧 Backend:  http://localhost:8000"
echo ""
echo "📱 Open http://localhost:3000 in your browser"
echo ""
echo "To stop servers: Press Ctrl+C or run './stop.sh'"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping servers..."
    kill $DJANGO_PID 2>/dev/null
    kill $NEXTJS_PID 2>/dev/null
    exit 0
}

# Set trap to cleanup on script exit
trap cleanup SIGINT SIGTERM

# Wait for processes
wait 