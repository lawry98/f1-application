"""FastAPI application entry point."""

import logging
import os

import fastf1
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

from config import EXPOSE_API_DOCS, FASTF1_CACHE_DIR, validate_config

validate_config()

os.makedirs(FASTF1_CACHE_DIR, exist_ok=True)
fastf1.Cache.enable_cache(FASTF1_CACHE_DIR)
logger.info("FastF1 cache enabled at '%s'", FASTF1_CACHE_DIR)

from api.app import create_app

app = create_app(expose_docs=EXPOSE_API_DOCS)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
