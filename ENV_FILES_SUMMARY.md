# Environment Files - Quick Summary

## 📁 What Files You Need to Create

### 1. Backend Environment File
**Location:** `backend/.env`  
**Copy from:** `backend/env.example`  
**Required:** ✅ YES - App won't work without this

### 2. Frontend Environment File
**Location:** `frontend/.env.local`  
**Copy from:** `frontend/env.example`  
**Required:** ⚠️ Usually not needed for local development

---

## ⚡ Quick Setup (2 Minutes)

### Copy the Example Files

**Windows PowerShell:**
```powershell
# Backend
cd backend
copy env.example .env

# Frontend
cd ..\frontend
copy env.example .env.local
```

**Mac/Linux:**
```bash
# Backend
cd backend
cp env.example .env

# Frontend
cd ../frontend
cp env.example .env.local
```

### Edit Backend .env File

**Windows:**
```powershell
cd backend
notepad .env
```

**Mac/Linux:**
```bash
cd backend
nano .env
# or
code .env
```

**Add your 3 API keys:**
1. Replace `sk-ant-your-anthropic-api-key-here` with your Anthropic key
2. Replace `tvly-your-tavily-api-key-here` with your Tavily key  
3. Replace `your-openweather-api-key-here` with your OpenWeather key

**Save and close.**

### Frontend Usually Needs No Changes

The default `NEXT_PUBLIC_API_URL=http://localhost:8000` works for local development.

---

## 🔑 Where to Get API Keys

| API | URL | Time to Get | Free Tier |
|-----|-----|-------------|-----------|
| **Anthropic** | https://console.anthropic.com | 2 min | $5 credit |
| **Tavily** | https://tavily.com | 2 min | 1000/month |
| **OpenWeather** | https://openweathermap.org/api | 2 min + 15 min wait | 1000/day |

**Total time:** ~20 minutes (including OpenWeather activation wait)

---

## ✅ What Your .env Files Should Look Like

### backend/.env (REQUIRED)
```env
ANTHROPIC_API_KEY=sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz
TAVILY_API_KEY=tvly-1234567890abcdefghijklmnopqrstuvwxyz
OPENWEATHER_API_KEY=1234567890abcdef1234567890abcdef
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
```

### frontend/.env.local (Usually default is fine)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 🚨 Common Mistakes to Avoid

### ❌ DON'T do these:

```env
# ❌ DON'T use quotes
ANTHROPIC_API_KEY="sk-ant-123456"

# ❌ DON'T add spaces around =
ANTHROPIC_API_KEY = sk-ant-123456

# ❌ DON'T add comments on same line
ANTHROPIC_API_KEY=sk-ant-123456 # my key

# ❌ DON'T use placeholders
ANTHROPIC_API_KEY=your-key-here
```

### ✅ DO this:

```env
# ✅ Correct format
ANTHROPIC_API_KEY=sk-ant-api03-1234567890abcdef
TAVILY_API_KEY=tvly-1234567890abcdef
OPENWEATHER_API_KEY=1234567890abcdef1234567890abcdef
```

---

## 🧪 Test Your Setup

### Verify Files Exist

**Windows:**
```powershell
# Check backend .env
cd backend
dir .env

# Check frontend .env.local
cd ..\frontend  
dir .env.local
```

**Mac/Linux:**
```bash
# Check backend .env
cd backend
ls -la .env

# Check frontend .env.local
cd ../frontend
ls -la .env.local
```

### Verify Keys Are Loaded

**Windows:**
```powershell
cd backend
.\venv\Scripts\activate
python -c "import os; from dotenv import load_dotenv; load_dotenv(); print('✅ Keys loaded' if os.getenv('ANTHROPIC_API_KEY') else '❌ Keys missing')"
```

Expected: `✅ Keys loaded`

---

## 📚 Need More Help?

- **Quick setup:** See `QUICKSTART.md`
- **Detailed guide:** See `ENV_SETUP_GUIDE.md`
- **Key reference:** See `API_KEYS_REFERENCE.md`
- **Full examples:** See `EXAMPLE_ENV_FILES.md`
- **Step-by-step:** See `SETUP_CHECKLIST.md`

---

## 🎯 Ready to Start?

Once you have:
- [x] `backend/.env` with 3 API keys
- [x] `frontend/.env.local` (default is fine)

Then:
1. Start backend: `python main.py`
2. Start frontend: `npm run dev`
3. Open http://localhost:3000
4. Generate your first briefing! 🏎️

---

## 📝 Checklist

- [ ] Signed up for Anthropic (https://console.anthropic.com)
- [ ] Signed up for Tavily (https://tavily.com)
- [ ] Signed up for OpenWeather (https://openweathermap.org/api)
- [ ] Copied all 3 API keys
- [ ] Created `backend/.env` file
- [ ] Added all 3 keys to `backend/.env`
- [ ] Created `frontend/.env.local` file (optional)
- [ ] Waited 15 minutes for OpenWeather key to activate
- [ ] Tested that keys are loaded
- [ ] Ready to start the app!

---

**That's it! You're ready to generate F1 briefings! 🏁**
