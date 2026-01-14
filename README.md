# F1 Race Weekend Briefing Agent

An AI-powered F1 race weekend briefing generator that provides comprehensive pre-race analysis using Claude Sonnet 4. The agent gathers data from multiple sources and produces detailed briefings covering track info, championship context, driver form, news storylines, weather, and predictions.

## Features

- 🏎️ **Comprehensive Race Analysis**: Track profiles, championship standings, historical data
- 🤖 **AI-Powered Insights**: Claude Sonnet 4 synthesizes data into expert-level briefings
- 🔍 **Multi-Source Data**: FastF1 telemetry, Ergast API, news search, weather forecasts
- 📊 **Agent Transparency**: View the reasoning and tool execution trace
- 🌊 **Real-time Streaming**: Server-Sent Events for live updates
- 🎨 **Modern UI**: Clean, F1-branded interface with Tailwind CSS

## Tech Stack

### Backend
- **Python 3.11+** with FastAPI
- **LangGraph** for agent orchestration
- **LangChain + Anthropic Claude** (claude-sonnet-4-20250514)
- **FastF1** for F1 telemetry and data
- **Ergast API** for historical F1 data
- **Tavily API** for news search
- **OpenWeather API** for forecasts

### Frontend
- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **React Markdown**

## Project Structure

```
f1-application/
├── backend/
│   ├── agent/
│   │   ├── state.py          # Agent state definitions
│   │   ├── graph.py          # LangGraph workflow
│   │   └── prompts.py        # System prompts
│   ├── tools/
│   │   ├── fastf1_tools.py   # Track & telemetry data
│   │   ├── ergast_tools.py   # Historical stats
│   │   ├── search_tools.py   # News search
│   │   └── weather_tools.py  # Weather forecasts
│   ├── api/
│   │   └── routes.py         # FastAPI endpoints
│   ├── main.py               # FastAPI app entry
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── BriefingChat.tsx
│   │   ├── BriefingCard.tsx
│   │   ├── ToolTrace.tsx
│   │   └── RaceSelector.tsx
│   ├── lib/
│   │   └── api.ts
│   └── package.json
└── README.md
```

## Setup Instructions

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm or yarn

### API Keys Required

1. **Anthropic API Key**: Get from [console.anthropic.com](https://console.anthropic.com)
2. **Tavily API Key**: Get from [tavily.com](https://tavily.com)
3. **OpenWeather API Key**: Get from [openweathermap.org](https://openweathermap.org/api)

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create virtual environment:
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Create `.env` file:
```bash
cp .env.example .env
```

5. Edit `.env` and add your API keys:
```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
TAVILY_API_KEY=tvly-your-key-here
OPENWEATHER_API_KEY=your-openweather-key-here
```

6. Start the backend server:
```bash
python main.py
```

Backend will run on `http://localhost:8000`

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Start development server:
```bash
npm run dev
```

Frontend will run on `http://localhost:3000`

## Usage

1. Open `http://localhost:3000` in your browser
2. Either:
   - Click a quick-select button for upcoming races
   - Type a race name (e.g., "Monaco GP 2025", "Silverstone", "Italian GP")
3. Click "Generate" and watch the agent work
4. View the comprehensive briefing with sections on:
   - Track Profile
   - Championship Context
   - Form Guide
   - Key Storylines
   - Weather Watch
   - Predictions
5. Expand the "Agent Tool Trace" to see what tools were executed

## API Endpoints

### `POST /api/briefing`
Generate a complete race briefing.

**Request:**
```json
{
  "query": "Monaco GP 2025"
}
```

**Response:**
```json
{
  "race": "Monaco Grand Prix",
  "briefing": "## Track Profile\n...",
  "tool_trace": [
    {
      "tool": "get_track_info",
      "success": true,
      "summary": "..."
    }
  ]
}
```

### `POST /api/briefing/stream`
Stream briefing generation with real-time updates (Server-Sent Events).

### `GET /api/races/{year}`
Get F1 calendar for a specific year.

### `GET /api/health`
Health check endpoint.

## Agent Architecture

The agent uses a 3-node LangGraph workflow:

```
INPUT ("Monaco GP 2025")
        │
        ▼
┌───────────────┐
│   PLANNER     │  Parse query, identify race, create tool call plan
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ TOOL EXECUTOR │  Execute tools in parallel:
│               │  - get_track_info (FastF1)
│               │  - get_championship_standings (Ergast)
│               │  - get_historical_winners (Ergast)
│               │  - search_f1_news (Tavily)
│               │  - get_weather_forecast (OpenWeather)
└───────┬───────┘
        │
        ▼
┌───────────────┐
│  SYNTHESIZER  │  Combine all data into structured briefing
└───────┬───────┘
        │
        ▼
OUTPUT (Race Briefing)
```

## Testing

### Test Individual Tools

```bash
cd backend

# Test FastF1 tool
python -c "from tools.fastf1_tools import get_track_info; print(get_track_info.invoke({'circuit_name': 'Monaco', 'year': 2024}))"

# Test Ergast tool
python -c "from tools.ergast_tools import get_championship_standings; print(get_championship_standings.invoke({'year': 2024}))"

# Test search tool
python -c "from tools.search_tools import search_f1_news; print(search_f1_news.invoke({'query': 'Monaco 2024', 'max_results': 3}))"
```

### Test Agent

```bash
python -c "from agent.graph import agent; result = agent.invoke({'race_query': 'Monaco GP', 'messages': [], 'race_info': None, 'tasks': [], 'tool_results': [], 'briefing': None, 'current_step': 'planning'}); print(result['briefing'])"
```

### Test API

```bash
# Health check
curl http://localhost:8000/api/health

# Generate briefing
curl -X POST http://localhost:8000/api/briefing \
  -H "Content-Type: application/json" \
  -d '{"query": "Monaco GP 2025"}'

# Get races
curl http://localhost:8000/api/races/2025
```

## Important Notes

### FastF1 Caching

- First requests are slow (downloads telemetry data)
- Subsequent requests are fast (uses cache)
- Cache directory: `backend/cache/`
- Already added to `.gitignore`

### Ergast API Rate Limits

- Ergast API has rate limits
- Small delays added between requests
- Circuit ID mapping provided for common circuits

### Error Handling

- Tools return `{"error": "message"}` instead of raising exceptions
- Agent gracefully handles missing data
- Frontend shows user-friendly error messages

## Example Queries

- "Monaco GP 2025"
- "Silverstone"
- "Italian Grand Prix"
- "Next race in Las Vegas"
- "Hungarian GP"

## Development

### Backend Development

```bash
cd backend
uvicorn main:app --reload --port 8000
```

### Frontend Development

```bash
cd frontend
npm run dev
```

### Build for Production

**Backend:**
```bash
cd backend
pip install -r requirements.txt
python main.py
```

**Frontend:**
```bash
cd frontend
npm run build
npm start
```

## Deployment

### Backend (Railway/Fly.io)

1. Set environment variables in your platform
2. Use `python main.py` as start command
3. Ensure `cache/` directory is writable

### Frontend (Vercel)

1. Set `NEXT_PUBLIC_API_URL` environment variable
2. Deploy from GitHub
3. Build command: `npm run build`

## Troubleshooting

### "ANTHROPIC_API_KEY not configured"
- Ensure `.env` file exists in `backend/` directory
- Check API key is valid and starts with `sk-ant-`

### "Failed to fetch races"
- Backend must be running on `http://localhost:8000`
- Check CORS settings if using different ports
- FastF1 may be downloading data (first request is slow)

### "No event found for circuit"
- Try different year (some circuits change yearly)
- Use official Grand Prix names (see prompts.py for mappings)

### Slow first requests
- FastF1 downloads telemetry data on first use
- Be patient - subsequent requests are fast
- Cache is stored in `backend/cache/`

## Credits & Attributions

### 3D Model
"F1 2026 Release Car" (https://skfb.ly/oWL8J) by Nimaxo is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).

See [CREDITS.md](CREDITS.md) for full attributions.

## License

MIT License - See LICENSE file for details.

**Note:** The 3D model is separately licensed under CC BY 4.0.

## Credits

- **Claude Sonnet 4** by Anthropic
- **FastF1** Python library
- **Ergast API** for F1 data
- **Tavily** for web search
- **OpenWeather** for forecasts
