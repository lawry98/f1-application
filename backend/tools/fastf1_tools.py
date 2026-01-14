import fastf1
import os
from langchain_core.tools import tool
from typing import Dict, Any

cache_dir = 'cache/'
if not os.path.exists(cache_dir):
    os.makedirs(cache_dir)
fastf1.Cache.enable_cache(cache_dir)

@tool
def get_track_info(circuit_name: str, year: int) -> Dict[str, Any]:
    """Get detailed track information including characteristics, length, corners, and DRS zones.
    
    Args:
        circuit_name: Name of the circuit/Grand Prix (e.g., 'Monaco', 'Silverstone')
        year: Year of the race
    
    Returns:
        Dictionary with track details or error message
    """
    try:
        schedule = fastf1.get_event_schedule(year)
        event = schedule[schedule['EventName'].str.contains(circuit_name, case=False, na=False)]
        
        if event.empty:
            return {"error": f"No event found for {circuit_name} in {year}"}
        
        event_data = event.iloc[0]
        session = fastf1.get_session(year, event_data['EventName'], 'R')
        session.load(telemetry=False, weather=False, messages=False)
        
        return {
            "circuit_name": event_data['EventName'],
            "country": event_data['Country'],
            "location": event_data['Location'],
            "circuit_length_km": float(session.event['CircuitLength']) if 'CircuitLength' in session.event else None,
            "laps": int(event_data['RoundNumber']) if 'RoundNumber' in event_data else None,
            "date": str(event_data['EventDate']),
            "circuit_type": event_data.get('EventFormat', 'Standard')
        }
    except Exception as e:
        return {"error": f"Failed to get track info: {str(e)}"}

@tool
def get_recent_race_results(event_name: str, year: int) -> Dict[str, Any]:
    """Get the most recent race results from this circuit.
    
    Args:
        event_name: Name of the Grand Prix event
        year: Year to look up (will try to get previous year if current year not available)
    
    Returns:
        Dictionary with race results or error message
    """
    try:
        session = fastf1.get_session(year, event_name, 'R')
        session.load()
        
        results = session.results
        top_10 = results.head(10)[['Position', 'DriverNumber', 'Abbreviation', 'TeamName', 'Points', 'Status']]
        
        return {
            "year": year,
            "event": event_name,
            "results": top_10.to_dict('records')
        }
    except Exception as e:
        return {"error": f"Failed to get race results: {str(e)}"}

@tool
def get_driver_form(driver_code: str, year: int, num_races: int = 5) -> Dict[str, Any]:
    """Get recent form for a specific driver showing their last N race results.
    
    Args:
        driver_code: Three-letter driver abbreviation (e.g., 'VER', 'HAM', 'LEC')
        year: Current season year
        num_races: Number of recent races to analyze (default: 5)
    
    Returns:
        Dictionary with driver's recent results or error message
    """
    try:
        schedule = fastf1.get_event_schedule(year)
        completed_events = schedule[schedule['EventDate'] < fastf1.get_event_schedule(year).iloc[-1]['EventDate']].tail(num_races)
        
        driver_results = []
        total_points = 0
        
        for _, event in completed_events.iterrows():
            try:
                session = fastf1.get_session(year, event['EventName'], 'R')
                session.load()
                driver_result = session.results[session.results['Abbreviation'] == driver_code]
                
                if not driver_result.empty:
                    result_data = driver_result.iloc[0]
                    driver_results.append({
                        "event": event['EventName'],
                        "position": int(result_data['Position']) if result_data['Position'] > 0 else 'DNF',
                        "points": float(result_data['Points']),
                        "status": result_data['Status']
                    })
                    total_points += float(result_data['Points'])
            except:
                continue
        
        return {
            "driver": driver_code,
            "recent_results": driver_results,
            "total_points_last_races": total_points,
            "average_finish": sum(r['position'] for r in driver_results if isinstance(r['position'], int)) / len([r for r in driver_results if isinstance(r['position'], int)]) if driver_results else None
        }
    except Exception as e:
        return {"error": f"Failed to get driver form: {str(e)}"}
