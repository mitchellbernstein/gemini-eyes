#!/bin/bash

echo "🛑 Stopping Gemini Eyes App..."

# Kill processes on ports 8000 and 3001
echo "🧹 Killing processes on port 8000 (Django)..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || echo "No process found on port 8000"

echo "🧹 Killing processes on port 3000 (Next.js)..."  
lsof -ti:3000 | xargs kill -9 2>/dev/null || echo "No process found on port 3000"

echo "✅ All servers stopped!" 