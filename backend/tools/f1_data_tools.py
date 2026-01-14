import fastf1
from langchain_core.tools import tool
from typing import Dict, Any

@tool
def get_season_standings(year: int) -> Dict[str, Any]:
    """Get championship standings for a specific season using FastF1 data.
    
    Args:
        year: Championship year to query
    
    Returns:
        Dictionary with driver standings or error message
    """
    try:
        schedule = fastf1.get_event_schedule(year)
        
        # Get the most recent completed race
        completed_events = schedule[schedule['EventDate'] < schedule.iloc[-1]['EventDate']]
        
        if completed_events.empty:
            return {"error": f"No completed races found for {year} season yet"}
        
        # Get the last race to get current standings
        last_event = completed_events.iloc[-1]
        
        try:
            session = fastf1.get_session(year, last_event['EventName'], 'R')
            session.load()
            results = session.results
            
            # Aggregate points across season (simplified - just showing last race top 10)
            driver_standings = []
            for idx, row in results.head(10).iterrows():
                driver_standings.append({
                    "position": int(row['Position']) if row['Position'] > 0 else 'DNF',
                    "driver": row['FullName'],
                    "driver_code": row['Abbreviation'],
                    "team": row['TeamName'],
                    "points": float(row['Points'])
                })
            
            return {
                "year": year,
                "last_race": last_event['EventName'],
                "driver_standings": driver_standings,
                "note": "Standings from most recent race"
            }
        except Exception as e:
            return {"error": f"Could not load race data: {str(e)}"}
            
    except Exception as e:
        return {"error": f"Failed to get season standings: {str(e)}"}

@tool
def get_circuit_winners(circuit_name: str, years_back: int = 3) -> Dict[str, Any]:
    """Get recent winners at a specific circuit using FastF1.
    
    Args:
        circuit_name: Name of the circuit/Grand Prix
        years_back: Number of years to look back (default: 3)
    
    Returns:
        Dictionary with recent winners or error message
    """
    try:
        current_year = 2025
        winners = []
        
        for year in range(current_year - years_back, current_year):
            try:
                schedule = fastf1.get_event_schedule(year)
                event = schedule[schedule['EventName'].str.contains(circuit_name, case=False, na=False)]
                
                if not event.empty:
                    event_data = event.iloc[0]
                    session = fastf1.get_session(year, event_data['EventName'], 'R')
                    session.load()
                    
                    # Get the winner (Position 1)
                    winner = session.results[session.results['Position'] == 1]
                    
                    if not winner.empty:
                        winner_data = winner.iloc[0]
                        time_val = winner_data.get('Time', 'N/A')
                        time_str = str(time_val) if time_val != 'N/A' else 'N/A'
                        
                        winners.append({
                            "year": year,
                            "driver": winner_data['FullName'],
                            "driver_code": winner_data['Abbreviation'],
                            "team": winner_data['TeamName'],
                            "time": time_str
                        })
            except:
                continue
        
        return {
            "circuit": circuit_name,
            "recent_winners": winners if winners else [{"note": "No recent data available"}]
        }
    except Exception as e:
        return {"error": f"Failed to get circuit winners: {str(e)}"}

@tool
def get_circuit_info(circuit_name: str, year: int = 2024) -> Dict[str, Any]:
    """Get detailed circuit information and characteristics.
    
    Args:
        circuit_name: Name of the circuit/Grand Prix
        year: Year to get circuit data from (default: 2024)
    
    Returns:
        Dictionary with circuit information or error message
    """
    try:
        schedule = fastf1.get_event_schedule(year)
        event = schedule[schedule['EventName'].str.contains(circuit_name, case=False, na=False)]
        
        if event.empty:
            return {"error": f"No event found for {circuit_name} in {year}"}
        
        event_data = event.iloc[0]
        
        return {
            "circuit_name": event_data['EventName'],
            "country": event_data['Country'],
            "location": event_data['Location'],
            "date": str(event_data['EventDate']),
            "event_format": event_data.get('EventFormat', 'Standard'),
            "official_name": event_data.get('OfficialEventName', event_data['EventName'])
        }
    except Exception as e:
        return {"error": f"Failed to get circuit info: {str(e)}"}
