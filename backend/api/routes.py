from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sse_starlette.sse import EventSourceResponse
import asyncio
import json
from concurrent.futures import ThreadPoolExecutor

from agent.graph import agent
from agent.state import AgentState

executor = ThreadPoolExecutor(max_workers=4)

router = APIRouter(prefix="/api")

class BriefingRequest(BaseModel):
    query: str

class BriefingResponse(BaseModel):
    race: str
    briefing: str
    tool_trace: List[Dict[str, Any]]

@router.post("/briefing", response_model=BriefingResponse)
async def generate_briefing(request: BriefingRequest):
    """Generate a race briefing for the given query."""
    try:
        initial_state: AgentState = {
            "messages": [],
            "race_query": request.query,
            "race_info": None,
            "tasks": [],
            "tool_results": [],
            "briefing": None,
            "current_step": "planning"
        }
        
        result = agent.invoke(initial_state)
        
        if result.get("current_step") == "error" or not result.get("briefing"):
            raise HTTPException(status_code=500, detail="Failed to generate briefing")
        
        race_name = result.get("race_info", {}).get("name", "Unknown Race")
        
        tool_trace = [
            {
                "tool": tr["tool_name"],
                "success": tr["success"],
                "summary": str(tr["data"])[:200] + "..." if len(str(tr["data"])) > 200 else str(tr["data"])
            }
            for tr in result.get("tool_results", [])
        ]
        
        return BriefingResponse(
            race=race_name,
            briefing=result["briefing"],
            tool_trace=tool_trace
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/briefing/stream")
async def generate_briefing_stream(request: BriefingRequest):
    """Generate a race briefing with streaming updates."""
    async def event_generator():
        try:
            print(f"Starting briefing generation for: {request.query}")
            
            initial_state: AgentState = {
                "messages": [],
                "race_query": request.query,
                "race_info": None,
                "tasks": [],
                "tool_results": [],
                "briefing": None,
                "current_step": "planning"
            }
            
            yield {
                "event": "status",
                "data": json.dumps({"step": "planning", "message": "Planning data gathering..."})
            }
            
            await asyncio.sleep(0.1)
            
            print("Invoking agent...")
            
            # Run the agent in a thread pool since it's synchronous
            loop = asyncio.get_event_loop()
            
            def run_agent():
                results = []
                for step_result in agent.stream(initial_state):
                    results.append(step_result)
                return results
            
            step_results = await loop.run_in_executor(executor, run_agent)
            
            result = {}
            for step_result in step_results:
                print(f"Step result: {list(step_result.keys())}")
                result.update(step_result)
                
                current_step = list(step_result.keys())[0] if step_result else "unknown"
                step_data = step_result.get(current_step, {})
                
                if current_step == "planner":
                    print("Planner completed")
                    race_info = step_data.get("race_info")
                    if race_info:
                        yield {
                            "event": "race_info",
                            "data": json.dumps(race_info)
                        }
                    yield {
                        "event": "status",
                        "data": json.dumps({"step": "gathering", "message": "Gathering race data..."})
                    }
                
                elif current_step == "tool_executor":
                    print("Tool executor completed")
                    tool_results = step_data.get("tool_results", [])
                    for tr in tool_results:
                        yield {
                            "event": "tool_result",
                            "data": json.dumps({
                                "tool": tr["tool_name"],
                                "success": tr["success"]
                            })
                        }
                    yield {
                        "event": "status",
                        "data": json.dumps({"step": "synthesizing", "message": "Generating briefing..."})
                    }
                
                elif current_step == "synthesizer":
                    print("Synthesizer completed")
                    briefing = step_data.get("briefing")
                    if briefing:
                        yield {
                            "event": "briefing",
                            "data": json.dumps({"content": briefing})
                        }
                        yield {
                            "event": "complete",
                            "data": json.dumps({"message": "Briefing complete"})
                        }
            
            print("Agent execution completed")
            
        except Exception as e:
            print(f"ERROR in briefing generation: {str(e)}")
            import traceback
            traceback.print_exc()
            yield {
                "event": "error",
                "data": json.dumps({"message": str(e)})
            }
    
    return EventSourceResponse(event_generator())

@router.get("/races/{year}")
async def get_races(year: int):
    """Get F1 calendar for a specific year."""
    try:
        import fastf1
        schedule = fastf1.get_event_schedule(year)
        
        races = []
        for _, event in schedule.iterrows():
            races.append({
                "name": event['EventName'],
                "location": event['Location'],
                "country": event['Country'],
                "date": str(event['EventDate']),
                "round": int(event['RoundNumber']) if 'RoundNumber' in event else None
            })
        
        return {"year": year, "races": races}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "service": "f1-briefing-agent"}
