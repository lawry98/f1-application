# 🔑 API Keys Quick Reference Card

Print this or keep it handy while setting up!

---

## 📍 Where to Get Each API Key

| Service | URL | Purpose | Free Tier |
|---------|-----|---------|-----------|
| **Anthropic** | https://console.anthropic.com | AI Agent (Claude) | $5 credit (~500 briefings) |
| **Tavily** | https://tavily.com | News Search | 1,000 searches/month |
| **OpenWeather** | https://openweathermap.org/api | Weather Forecasts | 1,000 calls/day |
| LangSmith | https://smith.langchain.com | Debugging (optional) | Free tier available |

---

## 📝 Key Format Examples

```env
# ✅ CORRECT - Anthropic key format
ANTHROPIC_API_KEY=sk-ant-api03-1234567890abcdef

# ✅ CORRECT - Tavily key format  
TAVILY_API_KEY=tvly-1234567890abcdef

# ✅ CORRECT - OpenWeather key format
OPENWEATHER_API_KEY=1234567890abcdef1234567890abcdef

# ❌ WRONG - Don't use quotes
ANTHROPIC_API_KEY="sk-ant-api03-1234567890abcdef"

# ❌ WRONG - Don't add spaces
ANTHROPIC_API_KEY= sk-ant-api03-1234567890abcdef

# ❌ WRONG - Don't add comments on same line
ANTHROPIC_API_KEY=sk-ant-api03-1234567890abcdef # my key
```

---

## 🗂️ File Locations

```
f1-application/
├── backend/
│   └── .env          ← Create this file (copy from env.example)
│
└── frontend/
    └── .env.local    ← Create this file (copy from env.example)
```

---

## ⚡ Quick Commands

### Create Backend .env
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

### Create Frontend .env.local
```powershell
# Windows
cd frontend
copy env.example .env.local

# Mac/Linux
cd frontend  
cp env.example .env.local
```

---

## 📋 Copy-Paste Template

### Backend (.env)
```env
ANTHROPIC_API_KEY=sk-ant-
TAVILY_API_KEY=tvly-
OPENWEATHER_API_KEY=
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
```

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## ✅ Verification Commands

### Check Backend Keys
```powershell
cd backend
.\venv\Scripts\activate
python -c "import os; from dotenv import load_dotenv; load_dotenv(); print('Keys loaded:', bool(os.getenv('ANTHROPIC_API_KEY')))"
```

### Check Backend Running
```powershell
curl http://localhost:8000/api/health
# Should return: {"status":"ok","service":"f1-briefing-agent"}
```

### Check Frontend Config
```powershell
cd frontend
type .env.local  # Windows
cat .env.local   # Mac/Linux
```

---

## 🚨 Security Checklist

- [ ] Never commit `.env` or `.env.local` files
- [ ] Check `.gitignore` includes `.env` and `.env.local`
- [ ] Don't share API keys in screenshots
- [ ] Don't hardcode keys in source files
- [ ] Use different keys for dev/prod
- [ ] Rotate keys if accidentally exposed

---

## 💰 Cost Estimates (Per Briefing)

| Service | Approx Cost | Notes |
|---------|-------------|-------|
| Anthropic | $0.003-0.01 | Depends on briefing length |
| Tavily | $0.001-0.005 | Usually 1-5 searches per briefing |
| OpenWeather | $0.0015 | 1 forecast call per briefing |
| **Total** | **~$0.005-0.02** | **Less than 2 cents per briefing!** |

**With free tiers:**
- Anthropic: First ~500 briefings free ($5 credit)
- Tavily: First 1,000 searches free = ~200-500 briefings
- OpenWeather: 1,000 calls/day free = unlimited for most users

**Bottom line:** Essentially free for personal use! 🎉

---

## ⏱️ Activation Times

| Service | Instant? | Notes |
|---------|----------|-------|
| Anthropic | ✅ Yes | Works immediately |
| Tavily | ✅ Yes | Works immediately |
| OpenWeather | ⚠️ 10-15 min | Must wait after creating key |
| LangSmith | ✅ Yes | Works immediately |

---

## 🔧 Troubleshooting Checklist

If something doesn't work:

1. **File named correctly?**
   - Backend: `.env` (not `env` or `.env.txt`)
   - Frontend: `.env.local` (not `env.local`)

2. **File in right location?**
   - Backend `.env` must be in `backend/` folder
   - Frontend `.env.local` must be in `frontend/` folder

3. **Keys have correct format?**
   - Anthropic starts with `sk-ant-`
   - Tavily starts with `tvly-`
   - OpenWeather is 32 hex characters

4. **No extra characters?**
   - No quotes: `KEY=value` not `KEY="value"`
   - No spaces: `KEY=value` not `KEY= value`
   - No comments: `KEY=value` not `KEY=value # comment`

5. **Server restarted?**
   - Stop backend (Ctrl+C) and restart
   - Stop frontend (Ctrl+C) and restart

6. **Virtual environment activated?** (Backend only)
   - Windows: `.\venv\Scripts\activate`
   - Mac/Linux: `source venv/bin/activate`

---

## 📱 Quick Support Links

- **Anthropic Console:** https://console.anthropic.com
- **Anthropic Docs:** https://docs.anthropic.com
- **Tavily Dashboard:** https://tavily.com/dashboard
- **OpenWeather Dashboard:** https://home.openweathermap.org/api_keys
- **LangSmith:** https://smith.langchain.com

---

## 🎯 Final Check Before Starting

```powershell
# 1. Backend .env exists and has keys
cd backend
type .env

# 2. Frontend .env.local exists  
cd ..\frontend
type .env.local

# 3. Start backend
cd ..\backend
.\venv\Scripts\activate
python main.py
# Should start on port 8000

# 4. Start frontend (new terminal)
cd frontend  
npm run dev
# Should start on port 3000

# 5. Open browser
# Go to http://localhost:3000
# Type "Monaco GP 2025"
# Click Generate
# 🏎️ Success!
```

---

**Need more help?** See `ENV_SETUP_GUIDE.md` for detailed troubleshooting!

**Ready to race?** Follow `QUICKSTART.md` for step-by-step setup!
