# Quick Start Guide

## Get Running in 5 Minutes

### Step 1: API Keys

Get these three API keys (all have free tiers):

1. **Anthropic** (required): https://console.anthropic.com
2. **Tavily** (required): https://tavily.com
3. **OpenWeather** (optional): https://openweathermap.org/api

### Step 2: Backend Setup

Open PowerShell and run:

```powershell
cd backend

# Create virtual environment
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file (edit with your API keys)
copy .env.example .env
notepad .env
```

**Edit `.env` and add your keys:**
```env
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
TAVILY_API_KEY=tvly-your-actual-key-here
OPENWEATHER_API_KEY=your-actual-key-here
```

**Start the backend:**
```powershell
python main.py
```

Keep this terminal open. Backend runs on `http://localhost:8000`

### Step 3: Frontend Setup

Open a **new PowerShell window**:

```powershell
cd frontend

# Install dependencies
npm install

# Start frontend
npm run dev
```

Frontend runs on `http://localhost:3000`

### Step 4: Use the App

1. Open browser to `http://localhost:3000`
2. Type "Monaco GP 2025" or click a quick-select button
3. Click "Generate"
4. Wait 10-30 seconds for first request (downloads F1 data)
5. Enjoy your AI-generated race briefing!

## Common Issues

### Port Already in Use

**Backend (8000):**
```powershell
# Find process using port 8000
netstat -ano | findstr :8000

# Kill it (replace PID with actual process ID)
taskkill /PID <PID> /F
```

**Frontend (3000):**
```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill it
taskkill /PID <PID> /F
```

### Python Not Found

Install Python 3.11+ from https://www.python.org/downloads/

Make sure to check "Add Python to PATH" during installation.

### Node/NPM Not Found

Install Node.js 18+ from https://nodejs.org/

### Virtual Environment Issues

```powershell
# If activation fails, enable scripts
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Then try activating again
.\venv\Scripts\activate
```

### First Request is Slow

This is normal! FastF1 downloads telemetry data on first use (~10-30 seconds).

Subsequent requests will be much faster (1-3 seconds) as data is cached.

### "ANTHROPIC_API_KEY not configured"

- Check `.env` file exists in `backend/` directory
- Make sure you saved the file after editing
- Restart the backend server after adding keys

## Testing Without Frontend

Test backend directly with PowerShell:

```powershell
# Health check
curl http://localhost:8000/api/health

# Generate briefing
Invoke-RestMethod -Uri "http://localhost:8000/api/briefing" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"query": "Monaco GP 2025"}'
```

## What's Next?

- Try different races: "Silverstone", "Monza", "Spa"
- Check the agent tool trace to see how it works
- Modify prompts in `backend/agent/prompts.py` to customize output
- Adjust the UI theme in `frontend/tailwind.config.ts`

## Development Tips

### Auto-Reload Backend

Backend auto-reloads when you edit Python files.

### Auto-Reload Frontend

Frontend hot-reloads when you edit TypeScript/React files.

### View API Docs

Backend includes interactive API docs:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### Check Logs

Backend logs appear in the terminal where you ran `python main.py`

Frontend logs appear in the terminal where you ran `npm run dev`

## Need Help?

- Check `README.md` for full documentation
- Review API endpoints at http://localhost:8000/docs
- Inspect network requests in browser DevTools
