import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import fastf1

load_dotenv()

# Verify environment variables are loaded
anthropic_key = os.getenv("ANTHROPIC_API_KEY")
if not anthropic_key or anthropic_key.startswith("sk-ant-your"):
    print("ERROR: ANTHROPIC_API_KEY not configured properly!")
    print("Please edit backend/.env and add your actual Anthropic API key")
    print("Get your key from: https://console.anthropic.com")
    exit(1)

tavily_key = os.getenv("TAVILY_API_KEY")
if not tavily_key or tavily_key.startswith("tvly-your"):
    print("WARNING: TAVILY_API_KEY not configured properly!")
    print("Some features may not work. Get your key from: https://tavily.com")

openweather_key = os.getenv("OPENWEATHER_API_KEY")
if not openweather_key or openweather_key == "your-openweather-api-key-here":
    print("WARNING: OPENWEATHER_API_KEY not configured properly!")
    print("Weather features may not work. Get your key from: https://openweathermap.org/api")

print("Environment variables loaded successfully")

cache_dir = 'cache/'
if not os.path.exists(cache_dir):
    os.makedirs(cache_dir)
fastf1.Cache.enable_cache(cache_dir)

from api.routes import router

app = FastAPI(
    title="F1 Briefing Agent API",
    description="AI-powered F1 race weekend briefing generator",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.get("/")
async def root():
    return {
        "message": "F1 Briefing Agent API",
        "docs": "/docs",
        "health": "/api/health"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
