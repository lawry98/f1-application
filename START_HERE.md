# 🏁 START HERE - F1 Briefing Agent

**Welcome!** This is your starting point for the F1 Race Weekend Briefing Agent.

---

## 🎯 What Is This?

An **AI-powered application** that generates comprehensive F1 race weekend briefings using Claude Sonnet 4. Just type a race name (like "Monaco GP 2025") and get expert-level analysis covering:

- 🏎️ Track characteristics and history
- 🏆 Championship standings and stakes  
- 📈 Driver and team form
- 📰 Latest news and storylines
- 🌤️ Weather forecast and strategy impact
- 🎯 Predictions for pole, podium, and dark horses

---

## ⚡ Quick Start (20 Minutes Total)

### 1️⃣ Get API Keys (15 minutes)

You need **3 free API keys**:

```
┌─────────────────────────────────────────────────────┐
│ Service    │ URL                        │ Time      │
├────────────┼────────────────────────────┼───────────┤
│ Anthropic  │ https://console.anthropic  │ 3 min    │
│            │         .com               │          │
├────────────┼────────────────────────────┼───────────┤
│ Tavily     │ https://tavily.com         │ 3 min    │
├────────────┼────────────────────────────┼───────────┤
│ OpenWeather│ https://openweathermap     │ 3 min +  │
│            │         .org/api           │ 15 wait  │
└────────────┴────────────────────────────┴───────────┘
```

**Note:** OpenWeather keys need 15 minutes to activate. Get it first!

### 2️⃣ Setup Backend (5 minutes)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\activate          # Windows
# source venv/bin/activate       # Mac/Linux
pip install -r requirements.txt
copy env.example .env            # Windows
# cp env.example .env            # Mac/Linux
notepad .env                     # Add your API keys
python main.py                   # Start backend
```

### 3️⃣ Setup Frontend (2 minutes)

**Open a NEW terminal:**

```powershell
cd frontend
npm install
copy env.example .env.local      # Windows
# cp env.example .env.local      # Mac/Linux
npm run dev                      # Start frontend
```

### 4️⃣ Use It! (1 minute)

1. Open http://localhost:3000
2. Type "Monaco GP 2025"
3. Click Generate
4. Wait ~20 seconds
5. Read your briefing! 🏎️

---

## 📚 Documentation (Pick One Path)

### 🟢 Beginner Path
**Goal:** Get it running step-by-step

1. **QUICKSTART.md** (5 min read, 20 min setup)
   - Simple, clear instructions
   - Common issues covered
   - Fast path to working app

2. **ENV_SETUP_GUIDE.md** (if you have API key issues)
   - How to get each key
   - Format examples
   - Troubleshooting

### 🟡 Detailed Path  
**Goal:** Understand everything

1. **README.md** (20 min read)
   - Complete documentation
   - Architecture explained
   - All features covered

2. **SETUP_CHECKLIST.md** (30 min interactive)
   - Step-by-step checklist
   - Nothing missed
   - Verification at each step

### 🔵 Reference Path
**Goal:** Quick lookup while setting up

1. **API_KEYS_REFERENCE.md** (5 min)
   - One-page reference card
   - All key formats
   - Cost estimates

2. **EXAMPLE_ENV_FILES.md** (5 min)
   - Exact file contents
   - Copy-paste templates
   - Verification commands

### 🟣 Expert Path
**Goal:** Get running ASAP

1. Copy `backend/env.example` to `backend/.env`
2. Add your API keys
3. `pip install -r requirements.txt`
4. `python main.py`
5. (New terminal) `npm install && npm run dev`
6. Done!

---

## 📁 Project Structure

```
f1-application/
│
├── 📖 DOCUMENTATION (Start with one of these)
│   ├── START_HERE.md           ← You are here!
│   ├── QUICKSTART.md            ← Fastest path
│   ├── README.md                ← Complete docs
│   ├── SETUP_CHECKLIST.md       ← Step-by-step
│   ├── ENV_SETUP_GUIDE.md       ← API key help
│   ├── API_KEYS_REFERENCE.md    ← Quick reference
│   └── DOCUMENTATION_INDEX.md   ← Navigation guide
│
├── 🔧 BACKEND (Python + FastAPI + LangGraph)
│   ├── agent/                   ← AI agent logic
│   ├── tools/                   ← Data gathering
│   ├── api/                     ← REST endpoints
│   ├── env.example              ← Copy to .env
│   └── main.py                  ← Start here
│
├── 🎨 FRONTEND (Next.js + TypeScript)
│   ├── app/                     ← Pages and layout
│   ├── components/              ← React components
│   ├── lib/                     ← API client
│   └── env.example              ← Copy to .env.local
│
└── 🚀 SCRIPTS
    ├── start-backend.ps1        ← One-click start
    └── start-frontend.ps1       ← One-click start
```

---

## 🎯 Choose Your Path

### I want to...

**...run it as fast as possible**
→ Follow this file, then `QUICKSTART.md`

**...understand how it works**
→ Read `README.md` first

**...follow a detailed checklist**
→ Use `SETUP_CHECKLIST.md`

**...just fix my environment variables**
→ See `ENV_SETUP_GUIDE.md`

**...see example files**
→ Check `EXAMPLE_ENV_FILES.md`

**...get API key help**
→ Use `API_KEYS_REFERENCE.md`

---

## ✅ Prerequisites

Before starting, make sure you have:

- [ ] **Python 3.11+** - Check: `python --version`
- [ ] **Node.js 18+** - Check: `node --version`
- [ ] **Git** (optional) - For version control
- [ ] **Text editor** - VS Code, Notepad, etc.
- [ ] **Web browser** - Chrome, Firefox, Edge
- [ ] **30 minutes** - For initial setup

Don't have Python or Node? Install them:
- Python: https://www.python.org/downloads/
- Node: https://nodejs.org/

---

## 🔑 API Keys at a Glance

```
┌──────────────────────────────────────────────────────────┐
│                    WHERE TO GET KEYS                     │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. ANTHROPIC (Claude AI) - REQUIRED                    │
│     https://console.anthropic.com                        │
│     • Free: $5 credit (~500 briefings)                  │
│     • Format: sk-ant-api03-...                          │
│                                                          │
│  2. TAVILY (News Search) - REQUIRED                     │
│     https://tavily.com                                   │
│     • Free: 1,000 searches/month                        │
│     • Format: tvly-...                                  │
│                                                          │
│  3. OPENWEATHER (Forecasts) - REQUIRED                  │
│     https://openweathermap.org/api                       │
│     • Free: 1,000 calls/day                             │
│     • Format: 32 hex characters                         │
│     • ⚠️ Activation: Wait 15 minutes after creation     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 🚦 Status Indicators

### ✅ Everything Working
- Backend on port 8000
- Frontend on port 3000
- Can generate briefings
- No errors in terminals

### ⚠️ Need Setup
- No .env files created
- API keys not configured
- Dependencies not installed
- Servers not started

### ❌ Issues
- CORS errors → Check NEXT_PUBLIC_API_URL
- API key errors → Verify .env file
- Port conflicts → Kill existing processes
- Slow first request → Normal! Wait for cache

---

## 🎓 What You'll Learn

This project demonstrates:

✅ **AI Agents** - LangGraph orchestration
✅ **Claude Sonnet 4** - Advanced reasoning
✅ **Tool Calling** - Structured function execution
✅ **REST APIs** - FastAPI endpoints
✅ **Streaming** - Server-Sent Events
✅ **Type Safety** - TypeScript + Pydantic
✅ **Modern UI** - Next.js 14 + Tailwind
✅ **API Integration** - Multiple external APIs

---

## 💰 Cost Estimates

### Development (Free Tiers)
- Anthropic: First ~500 briefings free
- Tavily: First 1,000 searches free
- OpenWeather: 1,000 calls/day free
- **Total: FREE for personal use!**

### Production (Per Briefing)
- Anthropic: ~$0.003-0.01
- Tavily: ~$0.001-0.005
- OpenWeather: ~$0.0015
- **Total: ~$0.005-0.02 (< 2 cents!)**

---

## 🏃 Action Steps (Right Now!)

1. **Get OpenWeather key first** (needs 15 min to activate)
   - Go to https://openweathermap.org/api
   - Sign up and get your key
   - Set a 15-minute timer

2. **While waiting, get other keys:**
   - Anthropic: https://console.anthropic.com
   - Tavily: https://tavily.com

3. **Save all 3 keys** somewhere safe (you'll need them soon)

4. **After 15 minutes, start setup:**
   - Follow `QUICKSTART.md`
   - Or use `SETUP_CHECKLIST.md`

---

## 📊 Time Breakdown

```
┌────────────────────────────────────────────┐
│ Activity           │ Time     │ Can Skip? │
├────────────────────┼──────────┼───────────┤
│ Get API keys       │ 15-20min │ ❌ No     │
│ Setup backend      │ 5 min    │ ❌ No     │
│ Setup frontend     │ 3 min    │ ❌ No     │
│ First briefing     │ 1-2 min  │ ❌ No     │
├────────────────────┼──────────┼───────────┤
│ Read README        │ 20 min   │ ✅ Yes    │
│ Understand code    │ 30 min   │ ✅ Yes    │
│ Customize          │ varies   │ ✅ Yes    │
└────────────────────┴──────────┴───────────┘

TOTAL TO WORKING APP: ~25 minutes
```

---

## 🆘 Quick Help

### Common First-Time Issues

**"Python not found"**
→ Install Python 3.11+ from python.org

**"npm not found"**
→ Install Node.js 18+ from nodejs.org

**"Port already in use"**
→ Close other apps or use different port

**"ANTHROPIC_API_KEY not configured"**
→ Check backend/.env file exists and has keys

**"CORS error in browser"**
→ Verify backend is running on port 8000

---

## 📞 Documentation Quick Links

- **Fast setup:** `QUICKSTART.md`
- **Complete info:** `README.md`
- **Step-by-step:** `SETUP_CHECKLIST.md`
- **API key help:** `API_KEYS_REFERENCE.md` or `ENV_SETUP_GUIDE.md`
- **Examples:** `EXAMPLE_ENV_FILES.md`
- **Navigation:** `DOCUMENTATION_INDEX.md`
- **Summary:** `PROJECT_COMPLETE.md`

---

## 🎉 You're Ready!

**Next step:** Choose your documentation path above and follow it!

**Recommended for first-time users:**
1. Read this file (you're doing it! ✅)
2. Get API keys (15-20 min)
3. Follow `QUICKSTART.md` (5 min)
4. Generate your first briefing! 🏁

---

**Let's get your F1 Briefing Agent running! 🏎️💨**

*Questions? Check the documentation files above or start with QUICKSTART.md*
