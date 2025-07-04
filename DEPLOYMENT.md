# 🚀 Motion Mentor Deployment Guide - Render.com

## **Prerequisites**
- [x] GitHub repository with your code
- [x] motionmentor.co domain purchased
- [x] Google OAuth Client ID & Secret
- [x] Gemini API Key
- [x] Render.com account

## **🎯 Deployment Architecture**
- **Backend**: `api.motionmentor.co` → Django API on Render
- **Frontend**: `motionmentor.co` → Static Next.js site on Render  
- **Database**: PostgreSQL managed by Render

---

## **Step 1: Commit & Push Your Code**

```bash
# Commit all deployment files
git add .
git commit -m "Add Render deployment configuration"
git push origin main
```

---

## **Step 2: Deploy to Render**

### **Option A: One-Click Deploy (Recommended)**
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New"** → **"Blueprint"**
3. Connect your GitHub repository: `motion-mentor`
4. Render will auto-detect `render.yaml` and create all services

### **Option B: Manual Setup**
If blueprint doesn't work, create services manually:

#### **Backend API Service**
1. **New** → **Web Service**
2. **Repository**: Connect your GitHub repo
3. **Name**: `motionmentor-api`
4. **Environment**: `Python`
5. **Build Command**: `cd backend && ./build.sh`
6. **Start Command**: `cd backend && gunicorn gemini_eyes.wsgi:application`
7. **Plan**: Starter ($7/month)

#### **Frontend Static Site**
1. **New** → **Static Site**
2. **Repository**: Same GitHub repo
3. **Name**: `motionmentor-frontend`
4. **Build Command**: `cd frontend && npm install && npm run build && npm run export`
5. **Publish Directory**: `frontend/out`
6. **Plan**: Free

#### **Database**
1. **New** → **PostgreSQL**
2. **Name**: `motionmentor-db`
3. **Database Name**: `motionmentor`
4. **User**: `motionmentor_user`
5. **Plan**: Starter ($7/month)

---

## **Step 3: Configure Environment Variables**

### **Backend API Environment Variables**
Go to your API service → **Environment** tab:

```bash
# Required Variables
SECRET_KEY=<auto-generated>
DEBUG=False
ALLOWED_HOSTS=motionmentor-api.onrender.com,api.motionmentor.co
FRONTEND_URL=https://motionmentor.co
DATABASE_URL=<auto-populated from database>

# Google OAuth (from your Google Cloud Console)
GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret

# Gemini API (from Google AI Studio)
GEMINI_API_KEY=your-gemini-api-key-here
```

### **Frontend Environment Variables**
Go to your static site → **Environment** tab:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=https://api.motionmentor.co
NEXT_PUBLIC_GOOGLE_CLIENT_ID=123456789-abc.apps.googleusercontent.com
```

---

## **Step 4: Update Google OAuth Settings**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. **APIs & Services** → **Credentials**
3. Edit your OAuth 2.0 Client ID
4. **Authorized JavaScript origins**:
   ```
   https://motionmentor.co
   https://motionmentor-frontend.onrender.com
   ```
5. **Authorized redirect URIs**:
   ```
   https://motionmentor.co
   https://motionmentor.co/
   https://motionmentor-frontend.onrender.com
   ```

---

## **Step 5: Configure Custom Domain**

### **Backend Domain (api.motionmentor.co)**
1. Go to your API service → **Settings** → **Custom Domains**
2. Add domain: `api.motionmentor.co`
3. Copy the CNAME record provided by Render

### **Frontend Domain (motionmentor.co)**
1. Go to your static site → **Settings** → **Custom Domains**  
2. Add domains: `motionmentor.co` and `www.motionmentor.co`
3. Copy the CNAME records provided by Render

### **DNS Configuration**
In your domain registrar (where you bought motionmentor.co):

```bash
# Add these DNS records:
Type: CNAME
Host: api
Value: <render-backend-url>

Type: CNAME  
Host: @
Value: <render-frontend-url>

Type: CNAME
Host: www  
Value: <render-frontend-url>
```

---

## **Step 6: Test Deployment**

### **Health Checks**
- **Backend**: https://api.motionmentor.co/api/health
- **Frontend**: https://motionmentor.co

### **Full Flow Test**
1. Visit https://motionmentor.co
2. Sign in with Google
3. Select an activity template
4. Record a test video
5. Verify AI analysis works

---

## **Step 7: Admin Access**

### **Create Superuser**
In Render dashboard → API service → **Shell**:
```bash
python manage.py createsuperuser
```

### **Admin Dashboard**
- URL: https://api.motionmentor.co/admin
- Monitor users, usage, and rate limits

---

## **🎉 Go Live Checklist**

- [ ] Backend API deployed and responding
- [ ] Frontend static site deployed  
- [ ] Database connected and migrations run
- [ ] Environment variables configured
- [ ] Google OAuth updated for production domains
- [ ] Custom domains configured with DNS
- [ ] SSL certificates auto-generated by Render
- [ ] Admin superuser created
- [ ] Full user flow tested end-to-end

---

## **💰 Monthly Costs**

- **API Service**: $7/month (Starter)
- **Static Site**: Free
- **PostgreSQL**: $7/month (Starter)
- **Total**: ~$14/month

---

## **🔧 Troubleshooting**

### **Common Issues**
1. **CORS errors**: Check ALLOWED_HOSTS and CORS_ALLOWED_ORIGINS
2. **API connection failed**: Verify NEXT_PUBLIC_API_URL in frontend
3. **Google OAuth failed**: Update authorized origins/redirects
4. **Database connection**: Check DATABASE_URL environment variable

### **Logs**
- **Backend**: Render Dashboard → API Service → Logs
- **Frontend**: Static sites have minimal logs  
- **Database**: Render Dashboard → Database → Logs

---

Your Motion Mentor app is now live at **https://motionmentor.co**! 🎉 