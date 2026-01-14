# ✅ F1 Briefing Agent - Complete Setup Checklist

Use this checklist to set up the F1 Briefing Agent step by step. Check off each item as you complete it.

---

## 📋 Phase 1: Get API Keys (15 minutes)

### Anthropic (Claude AI) - REQUIRED
- [ ] Go to https://console.anthropic.com
- [ ] Create account or log in
- [ ] Navigate to Settings → API Keys
- [ ] Click "Create Key"
- [ ] Copy key (starts with `sk-ant-`)
- [ ] Save key somewhere safe (you'll need it soon)

### Tavily (News Search) - REQUIRED  
- [ ] Go to https://tavily.com
- [ ] Create free account
- [ ] Go to API Keys section
- [ ] Copy your API key (starts with `tvly-`)
- [ ] Save key somewhere safe

### OpenWeather (Forecasts) - REQUIRED
- [ ] Go to https://openweathermap.org/api
- [ ] Create free account
- [ ] Navigate to API Keys (in account menu)
- [ ] Copy your default API key (32 hex characters)
- [ ] Save key somewhere safe
- [ ] ⚠️ **Wait 10-15 minutes** for key to activate

### LangSmith (Debugging) - OPTIONAL
- [ ] Skip this unless you want agent debugging
- [ ] If needed: https://smith.langchain.com

---

## 📋 Phase 2: Backend Setup (10 minutes)

### Install Python Dependencies
- [ ] Open PowerShell/Terminal
- [ ] Navigate to project: `cd c:\projects\f1-application`
- [ ] Go to backend: `cd backend`
- [ ] Create virtual environment: `python -m venv venv`
- [ ] Activate venv (Windows): `.\venv\Scripts\activate`
- [ ] Activate venv (Mac/Linux): `source venv/bin/activate`
- [ ] Verify activation: prompt should show `(venv)`
- [ ] Install packages: `pip install -r requirements.txt`
- [ ] Wait for installation (2-3 minutes)

### Configure Environment Variables
- [ ] Copy example file: `copy env.example .env` (Windows) or `cp env.example .env` (Mac/Linux)
- [ ] Open .env file: `notepad .env` (Windows) or `nano .env` (Mac/Linux)
- [ ] Replace `sk-ant-your-anthropic-api-key-here` with your Anthropic key
- [ ] Replace `tvly-your-tavily-api-key-here` with your Tavily key
- [ ] Replace `your-openweather-api-key-here` with your OpenWeather key
- [ ] Save file
- [ ] Verify file: `type .env` (Windows) or `cat .env` (Mac/Linux)

### Test Backend
- [ ] Start server: `python main.py`
- [ ] Wait for: `Uvicorn running on http://0.0.0.0:8000`
- [ ] Open new terminal
- [ ] Test health endpoint: `curl http://localhost:8000/api/health`
- [ ] Should see: `{"status":"ok","service":"f1-briefing-agent"}`
- [ ] Return to first terminal (leave server running)

---

## 📋 Phase 3: Frontend Setup (5 minutes)

### Install Node Dependencies
- [ ] Open **new** PowerShell/Terminal window
- [ ] Navigate to project: `cd c:\projects\f1-application`
- [ ] Go to frontend: `cd frontend`
- [ ] Install packages: `npm install`
- [ ] Wait for installation (1-2 minutes)

### Configure Environment (Usually No Changes Needed)
- [ ] Copy example file: `copy env.example .env.local` (Windows) or `cp env.example .env.local` (Mac/Linux)
- [ ] Verify contents: `type .env.local` (Windows) or `cat .env.local` (Mac/Linux)
- [ ] Should see: `NEXT_PUBLIC_API_URL=http://localhost:8000`
- [ ] If backend is on different port, edit accordingly
- [ ] Otherwise, leave as-is

### Start Frontend
- [ ] Start dev server: `npm run dev`
- [ ] Wait for: `Ready on http://localhost:3000`
- [ ] Keep this terminal open

---

## 📋 Phase 4: First Run Test (2 minutes)

### Access the Application
- [ ] Open web browser
- [ ] Navigate to: http://localhost:3000
- [ ] Page should load with F1 Briefing Agent title
- [ ] No CORS errors in browser console (F12)

### Generate First Briefing
- [ ] Type in search box: `Monaco GP 2025`
- [ ] Click "Generate" button
- [ ] See status: "Planning data gathering..."
- [ ] See status: "Gathering race data..."
- [ ] See status: "Generating briefing..."
- [ ] ⏱️ **Wait 10-30 seconds** (first run downloads F1 data)
- [ ] Briefing appears with sections:
  - [ ] Track Profile
  - [ ] Championship Context
  - [ ] Form Guide
  - [ ] Key Storylines
  - [ ] Weather Watch
  - [ ] Predictions
- [ ] Click "Agent Tool Trace" to expand
- [ ] See green checkmarks for successful tools

### Test Another Race (Should Be Faster)
- [ ] Clear search box
- [ ] Type: `Silverstone`
- [ ] Click "Generate"
- [ ] Should complete in 1-5 seconds (cached data)
- [ ] Briefing appears successfully

---

## 📋 Phase 5: Verify Everything Works

### Backend Verification
- [ ] Backend terminal shows no errors
- [ ] Health endpoint responds: http://localhost:8000/api/health
- [ ] API docs load: http://localhost:8000/docs
- [ ] Can see all endpoints in docs

### Frontend Verification
- [ ] Frontend terminal shows no errors
- [ ] Page loads at http://localhost:3000
- [ ] Quick-select buttons appear
- [ ] Can type in search box
- [ ] Generate button works
- [ ] Briefings display properly
- [ ] Tool trace expands/collapses

### Data Verification
- [ ] Track info appears (circuit length, location)
- [ ] Championship standings show current season
- [ ] Historical winners show past results
- [ ] News articles are recent (check dates)
- [ ] Weather forecast shows upcoming days
- [ ] Predictions section has specific names

---

## 📋 Troubleshooting Checklist

If something doesn't work, check these:

### Backend Issues
- [ ] Virtual environment is activated (see `(venv)` in prompt)
- [ ] All packages installed: `pip list | grep fastapi`
- [ ] .env file exists in backend/ folder
- [ ] API keys in .env are correct (no quotes, no spaces)
- [ ] Port 8000 is not already in use
- [ ] Python version is 3.11+ : `python --version`

### Frontend Issues
- [ ] node_modules/ folder exists
- [ ] .env.local file exists in frontend/ folder
- [ ] Backend is running on port 8000
- [ ] NEXT_PUBLIC_API_URL matches backend port
- [ ] Port 3000 is not already in use
- [ ] Node version is 18+: `node --version`

### API Key Issues
- [ ] Anthropic key starts with `sk-ant-`
- [ ] Tavily key starts with `tvly-`
- [ ] OpenWeather key is 32 characters
- [ ] Waited 15 minutes for OpenWeather activation
- [ ] No error in backend logs about API keys
- [ ] Keys are active on provider dashboards

### Request Issues
- [ ] Backend shows request logs when you click Generate
- [ ] Frontend shows status updates
- [ ] No CORS errors in browser console (F12)
- [ ] First request takes longer (10-30 sec is normal)
- [ ] Subsequent requests are faster

---

## 📋 Optional: Advanced Setup

### Enable LangSmith Tracing (For Debugging)
- [ ] Get API key from https://smith.langchain.com
- [ ] Edit backend/.env
- [ ] Set: `LANGCHAIN_TRACING_V2=true`
- [ ] Set: `LANGCHAIN_API_KEY=your-key`
- [ ] Restart backend
- [ ] View traces at https://smith.langchain.com

### Customize Prompts
- [ ] Edit `backend/agent/prompts.py`
- [ ] Modify PLANNER_PROMPT or SYNTHESIZER_PROMPT
- [ ] Restart backend to see changes

### Customize UI Theme
- [ ] Edit `frontend/tailwind.config.ts`
- [ ] Change colors in theme.extend.colors
- [ ] Frontend auto-reloads with changes

### Add More Circuits
- [ ] Edit `backend/tools/ergast_tools.py`
- [ ] Add entries to CIRCUIT_IDS dictionary
- [ ] Restart backend

---

## 📋 Final Verification

### Complete System Check
- [ ] Backend running without errors
- [ ] Frontend running without errors
- [ ] Can generate briefings for multiple races
- [ ] Tool trace shows successful executions
- [ ] No CORS errors
- [ ] No API key errors
- [ ] Data looks accurate and recent

### Performance Check
- [ ] First briefing: 10-30 seconds ✅
- [ ] Subsequent briefings: 1-5 seconds ✅
- [ ] Quick-select buttons load ✅
- [ ] Tool trace expands smoothly ✅
- [ ] Page is responsive ✅

---

## 🎉 Success Criteria

You're done when:
- ✅ Backend runs on port 8000 without errors
- ✅ Frontend runs on port 3000 without errors
- ✅ Can generate briefings for any race
- ✅ Briefings include all 6 sections
- ✅ Tool trace shows green checkmarks
- ✅ Subsequent requests are fast (cached)

---

## 📚 Next Steps

Now that everything works:

1. **Try different races:**
   - Monaco GP
   - Silverstone
   - Italian GP
   - Singapore GP
   - Las Vegas GP

2. **Explore the code:**
   - `backend/agent/graph.py` - Agent workflow
   - `backend/tools/` - Data gathering tools
   - `frontend/components/` - UI components

3. **Customize:**
   - Modify prompts for different analysis style
   - Add new tools for additional data sources
   - Customize UI colors and layout

4. **Deploy:**
   - Backend to Railway, Fly.io, or similar
   - Frontend to Vercel or Netlify
   - Update NEXT_PUBLIC_API_URL to production backend

---

## 🆘 Still Having Issues?

Check these resources:

- **README.md** - Full documentation
- **QUICKSTART.md** - Simplified setup guide
- **ENV_SETUP_GUIDE.md** - Detailed environment variable help
- **API_KEYS_REFERENCE.md** - Quick API key reference
- **EXAMPLE_ENV_FILES.md** - Complete example files

**Common Issues:**
1. Port already in use → Kill existing process
2. API key errors → Check format and activation
3. Slow first request → Normal, wait for cache
4. CORS errors → Check NEXT_PUBLIC_API_URL

**Still stuck?**
- Check backend logs (terminal where you ran `python main.py`)
- Check browser console (F12 → Console tab)
- Verify all checklist items above

---

## 💾 Save This Setup

Once everything works:

- [ ] Bookmark http://localhost:3000
- [ ] Save API keys in password manager
- [ ] Note any custom configurations
- [ ] Document any issues you encountered
- [ ] Keep terminals open or save start commands

**Quick restart next time:**
```powershell
# Terminal 1 - Backend
cd c:\projects\f1-application\backend
.\venv\Scripts\activate
python main.py

# Terminal 2 - Frontend  
cd c:\projects\f1-application\frontend
npm run dev
```

---

**Happy racing! 🏎️💨**
