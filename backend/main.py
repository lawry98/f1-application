"""FastAPI application entry point."""

import logging
import os

import fastf1
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

from config import FASTF1_CACHE_DIR, validate_config

validate_config()

os.makedirs(FASTF1_CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(FASTF1_CACHE_DIR)
logger.info("FastF1 cache enabled at '%s'", FASTF1_CACHE_DIR)

from api.routes import router

app = FastAPI(
    title="F1 Briefing Agent API",
    description="AI-powered F1 race weekend briefing generator",
    version="1.0.0",
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
async def root() -> dict:
    """API root — links to docs and health check."""
    return {
        "message": "F1 Briefing Agent API",
        "docs": "/docs",
        "health": "/api/health",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
