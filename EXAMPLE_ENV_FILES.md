# Example Environment Files

This document contains complete example environment files for both backend and frontend.

## 📁 Backend Environment File

**File location:** `backend/.env`

**How to create:**
```powershell
# Windows
cd backend
copy env.example .env
notepad .env

# Mac/Linux
cd backend
cp env.example .env
nano .env
```

**Complete example with explanations:**

```env
# ============================================
# REQUIRED API KEYS - YOU MUST FILL THESE IN
# ============================================

# Anthropic API Key
# Where to get: https://console.anthropic.com
# Format: sk-ant-[long string of characters]
# Example: sk-ant-api03-abcdef1234567890
ANTHROPIC_API_KEY=sk-ant-your-key-here

# Tavily API Key  
# Where to get: https://tavily.com
# Format: tvly-[long string of characters]
# Example: tvly-abcdef1234567890
TAVILY_API_KEY=tvly-your-key-here

# OpenWeather API Key
# Where to get: https://openweathermap.org/api
# Format: [32 character hex string]
# Example: 1234567890abcdef1234567890abcdef
OPENWEATHER_API_KEY=your-key-here

# ============================================
# OPTIONAL - LEAVE AS-IS FOR MOST USERS
# ============================================

# LangSmith tracing (for debugging agent execution)
# Set to 'true' only if you want detailed traces
LANGCHAIN_TRACING_V2=false

# Only needed if LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=

# Project name in LangSmith
LANGCHAIN_PROJECT=f1-briefing-agent
```

---

## 🌐 Frontend Environment File

**File location:** `frontend/.env.local`

**How to create:**
```powershell
# Windows
cd frontend
copy env.example .env.local
notepad .env.local

# Mac/Linux  
cd frontend
cp env.example .env.local
nano .env.local
```

**Complete example:**

```env
# Backend API URL
# For local development (default):
NEXT_PUBLIC_API_URL=http://localhost:8000

# For production, replace with your deployed backend URL:
# NEXT_PUBLIC_API_URL=https://your-backend.railway.app
# NEXT_PUBLIC_API_URL=https://your-backend.fly.dev
# NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

---

## 🚀 Quick Setup Commands

### Backend Setup (All-in-One)

**Windows PowerShell:**
```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
copy env.example .env
Write-Host "Now edit backend/.env and add your API keys!"
notepad .env
```

**Mac/Linux:**
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp env.example .env
echo "Now edit backend/.env and add your API keys!"
nano .env
```

### Frontend Setup (All-in-One)

**Windows PowerShell:**
```powershell
cd frontend
npm install
copy env.example .env.local
Write-Host "Frontend environment file created (usually no changes needed)"
```

**Mac/Linux:**
```bash
cd frontend
npm install
cp env.example .env.local
echo "Frontend environment file created (usually no changes needed)"
```

---

## 🔑 Where to Get API Keys

### 1. Anthropic (Claude) - REQUIRED
- Website: https://console.anthropic.com
- Sign up → Settings → API Keys → Create Key
- Free tier: $5 credit (enough for ~500 briefings)
- Key format: `sk-ant-api03-...`

### 2. Tavily (News Search) - REQUIRED  
- Website: https://tavily.com
- Sign up → Dashboard → API Keys
- Free tier: 1,000 searches/month
- Key format: `tvly-...`

### 3. OpenWeather (Forecasts) - REQUIRED
- Website: https://openweathermap.org/api
- Sign up → API Keys (in account menu)
- Free tier: 1,000 calls/day (plenty!)
- Key format: 32 character hex string
- ⚠️ Note: New keys take 10-15 min to activate

### 4. LangSmith (Debugging) - OPTIONAL
- Website: https://smith.langchain.com  
- Only needed if you want to debug agent execution
- Can skip this completely

---

## ✅ Verify Your Setup

### Test Backend Environment Variables

Run this after creating `backend/.env`:

```powershell
cd backend
.\venv\Scripts\activate

# Test script
python -c "import os; from dotenv import load_dotenv; load_dotenv(); print('Anthropic:', '✅' if os.getenv('ANTHROPIC_API_KEY', '').startswith('sk-ant') else '❌'); print('Tavily:', '✅' if os.getenv('TAVILY_API_KEY', '').startswith('tvly') else '❌'); print('OpenWeather:', '✅' if len(os.getenv('OPENWEATHER_API_KEY', '')) > 10 else '❌')"
```

Expected output:
```
Anthropic: ✅
Tavily: ✅  
OpenWeather: ✅
```

### Test Frontend Environment

Just verify the file exists:
```powershell
cd frontend
dir .env.local  # Windows
ls .env.local   # Mac/Linux
```

---

## 📋 Checklist

Before starting the application, ensure:

**Backend:**
- [ ] `backend/.env` file exists
- [ ] `ANTHROPIC_API_KEY` starts with `sk-ant-`
- [ ] `TAVILY_API_KEY` starts with `tvly-`  
- [ ] `OPENWEATHER_API_KEY` is 32 characters
- [ ] No extra spaces or quotes around keys
- [ ] Virtual environment is activated
- [ ] Dependencies installed (`pip install -r requirements.txt`)

**Frontend:**
- [ ] `frontend/.env.local` file exists
- [ ] `NEXT_PUBLIC_API_URL` points to `http://localhost:8000`
- [ ] Dependencies installed (`npm install`)

---

## 🐛 Common Issues

### "ANTHROPIC_API_KEY not configured"

**Fix:**
1. Check file is named exactly `.env` (not `env` or `.env.txt`)
2. Verify key starts with `sk-ant-`
3. Remove any quotes: `ANTHROPIC_API_KEY=sk-ant-123` (not `"sk-ant-123"`)
4. Restart backend server

### "Invalid Anthropic API key"

**Fix:**
1. Copy the entire key (they're very long!)
2. Check for extra spaces before/after the key
3. Verify key is active at https://console.anthropic.com

### "TAVILY_API_KEY not configured"  

**Fix:**
1. Verify key starts with `tvly-`
2. Check you copied the full key
3. Verify key is active at https://tavily.com

### "OpenWeather API error"

**Fix:**
1. Wait 15 minutes after creating a new key (activation delay)
2. Verify key at https://openweathermap.org/api
3. Check you're on the free tier (1000 calls/day)

### CORS errors in browser

**Fix:**
1. Ensure backend is running on port 8000
2. Check `NEXT_PUBLIC_API_URL=http://localhost:8000` in `frontend/.env.local`
3. Restart both backend and frontend

---

## 🎯 Ready to Test!

Once environment files are configured:

1. **Start Backend:**
   ```powershell
   cd backend
   .\venv\Scripts\activate
   python main.py
   ```
   Should see: `Uvicorn running on http://0.0.0.0:8000`

2. **Start Frontend (new terminal):**
   ```powershell
   cd frontend
   npm run dev
   ```
   Should see: `Ready on http://localhost:3000`

3. **Test the App:**
   - Open http://localhost:3000
   - Type "Monaco GP 2025"
   - Click "Generate"
   - Wait 10-30 seconds for first request
   - Enjoy your briefing! 🏎️

---

## 💡 Pro Tips

1. **Keep API keys safe**: Never commit `.env` files to Git
2. **Different keys for prod**: Use separate keys for production
3. **Monitor usage**: Check your API usage on provider dashboards
4. **Rate limits**: Anthropic and Tavily have rate limits on free tiers
5. **Cache everything**: FastF1 caches data automatically (saves time)

---

Need help? Check `ENV_SETUP_GUIDE.md` for detailed troubleshooting!
