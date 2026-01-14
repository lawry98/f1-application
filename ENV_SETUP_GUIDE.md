# Environment Variables Setup Guide

This guide will help you set up all the required environment variables for the F1 Briefing Agent.

## 📋 Overview

The application requires:
- **3 API keys** for the backend (2 required, 1 optional for debugging)
- **1 configuration variable** for the frontend

## 🔑 Getting API Keys

### 1. Anthropic API Key (REQUIRED)

**What it's for:** Powers Claude Sonnet 4, the AI brain of the agent

**How to get it:**
1. Go to https://console.anthropic.com
2. Sign up or log in
3. Click "Get API Keys" or go to Settings → API Keys
4. Create a new API key
5. Copy the key (starts with `sk-ant-`)

**Cost:** Pay-as-you-go, ~$0.003-0.01 per briefing

### 2. Tavily API Key (REQUIRED)

**What it's for:** Searches the web for latest F1 news and storylines

**How to get it:**
1. Go to https://tavily.com
2. Sign up for a free account
3. Navigate to your API keys section
4. Copy your API key (starts with `tvly-`)

**Cost:** Free tier includes 1,000 searches/month

### 3. OpenWeather API Key (REQUIRED)

**What it's for:** Provides weather forecasts for race locations

**How to get it:**
1. Go to https://openweathermap.org/api
2. Sign up for a free account
3. Go to "API keys" section in your profile
4. Copy your default API key or create a new one

**Cost:** Free tier includes 1,000 calls/day (more than enough)

**Note:** It may take 10-15 minutes for a new API key to activate

### 4. LangSmith API Key (OPTIONAL)

**What it's for:** Debug and trace agent execution (for development)

**How to get it:**
1. Go to https://smith.langchain.com
2. Sign up for a free account
3. Get your API key from Settings

**Cost:** Free tier available

## ⚙️ Backend Setup

### Step 1: Copy the example file

**Windows (PowerShell):**
```powershell
cd backend
copy .env.example .env
```

**Mac/Linux:**
```bash
cd backend
cp .env.example .env
```

### Step 2: Edit the .env file

Open `backend/.env` in your text editor:

**Windows:**
```powershell
notepad .env
```

**Mac/Linux:**
```bash
nano .env
# or
code .env
```

### Step 3: Add your API keys

Replace the placeholder values with your actual keys:

```env
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here-1234567890
TAVILY_API_KEY=tvly-your-actual-key-here-1234567890
OPENWEATHER_API_KEY=1234567890abcdef1234567890abcdef

# Optional - only if you want debugging
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
```

### Step 4: Save and verify

Save the file and verify it exists:

**Windows:**
```powershell
dir .env
```

**Mac/Linux:**
```bash
ls -la .env
```

## 🌐 Frontend Setup

### Step 1: Copy the example file

**Windows (PowerShell):**
```powershell
cd frontend
copy env.example .env.local
```

**Mac/Linux:**
```bash
cd frontend
cp env.example .env.local
```

### Step 2: Edit if needed

For local development, the default value is usually fine:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**Only change this if:**
- Your backend runs on a different port
- You're deploying to production
- You're connecting to a remote backend

## ✅ Verification

### Test Backend Environment

```powershell
cd backend

# Activate virtual environment
.\venv\Scripts\activate  # Windows
# or
source venv/bin/activate  # Mac/Linux

# Test that environment variables are loaded
python -c "import os; from dotenv import load_dotenv; load_dotenv(); print('✅ Anthropic:', 'Configured' if os.getenv('ANTHROPIC_API_KEY', '').startswith('sk-ant') else '❌ Missing'); print('✅ Tavily:', 'Configured' if os.getenv('TAVILY_API_KEY', '').startswith('tvly') else '❌ Missing'); print('✅ OpenWeather:', 'Configured' if os.getenv('OPENWEATHER_API_KEY') else '❌ Missing')"
```

Expected output:
```
✅ Anthropic: Configured
✅ Tavily: Configured
✅ OpenWeather: Configured
```

### Test Frontend Environment

Start the frontend and check the browser console. It should connect to the correct backend URL.

## 🔒 Security Best Practices

1. **Never commit .env files** to version control
   - Both `.env` and `.env.local` are in `.gitignore`

2. **Keep API keys secret**
   - Don't share them in screenshots, logs, or error messages
   - Don't hardcode them in source code

3. **Rotate keys if exposed**
   - If you accidentally expose a key, revoke it immediately
   - Generate a new key from the provider's dashboard

4. **Use different keys for development and production**
   - This helps track usage and limits damage if a key is compromised

5. **Set environment variables directly in production**
   - On Railway: Use the "Variables" tab
   - On Vercel: Use "Environment Variables" in project settings
   - On Fly.io: Use `fly secrets set KEY=value`

## 🐛 Troubleshooting

### "ANTHROPIC_API_KEY not configured"

**Solutions:**
1. Check `.env` file exists in `backend/` directory
2. Verify the key starts with `sk-ant-`
3. Make sure there are no quotes around the key
4. Restart the backend server after adding the key

### "Invalid API key" errors

**Solutions:**
1. Double-check you copied the entire key (they're long!)
2. Make sure there are no extra spaces before/after the key
3. Verify the key is active in your provider's dashboard
4. For OpenWeather, wait 15 minutes after creating the key

### Environment variables not loading

**Solutions:**
1. Make sure the file is named exactly `.env` (not `env` or `.env.txt`)
2. Check file is in the correct directory (`backend/.env`)
3. Restart your terminal/shell
4. Re-activate the virtual environment

### CORS errors in frontend

**Solution:**
Check `NEXT_PUBLIC_API_URL` in `frontend/.env.local` matches where your backend is actually running

## 📝 Example Complete Files

### backend/.env (complete example)
```env
ANTHROPIC_API_KEY=sk-ant-api03-1234567890abcdefghijklmnopqrstuvwxyz
TAVILY_API_KEY=tvly-1234567890abcdefghijklmnopqrstuvwxyz
OPENWEATHER_API_KEY=1234567890abcdef1234567890abcdef
LANGCHAIN_TRACING_V2=false
LANGCHAIN_API_KEY=
```

### frontend/.env.local (complete example)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## 🚀 Ready to Go!

Once you have all environment variables configured:

1. Start the backend: `python main.py`
2. Start the frontend: `npm run dev`
3. Open http://localhost:3000
4. Generate your first briefing! 🏎️

## 📞 Need Help?

- Check API key is valid on provider's dashboard
- Look at backend logs for detailed error messages
- Ensure all dependencies are installed
- Try the health endpoint: http://localhost:8000/api/health
