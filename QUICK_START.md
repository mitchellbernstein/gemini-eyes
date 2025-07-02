# 🚀 Quick Start Guide

## Super Easy Method (One Command!)

### Start Both Servers:
```bash
./start.sh
```

### Stop Both Servers:
```bash
./stop.sh
```

That's it! 🎉

---

## What Happens:
- **Django Backend** starts on `http://localhost:8000`
- **Next.js Frontend** starts on `http://localhost:3000`
- Opens in your browser automatically at `http://localhost:3000`

## Troubleshooting:

### If scripts don't work:
```bash
chmod +x start.sh stop.sh
```

### Manual method (if needed):

**Terminal 1 - Backend:**
```bash
cd backend
source venv/bin/activate  
python manage.py runserver 8000
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev -- --port 3000
```

---

## First Time Setup:
Make sure you have your environment files:
- `backend/.env` (with your API keys)
- `frontend/.env.local` (with your Google client ID)

Check `env-example.txt` for required variables.

---

## 📱 Ready to Use!
Once both servers are running, go to `http://localhost:3000` and sign in with Google! 