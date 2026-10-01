"""Pydantic models for API request contracts."""

from pydantic import BaseModel, Field


class BriefingRequest(BaseModel):
    """Request body for the briefing stream endpoint."""

    query: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Grand Prix name or circuit identifier (e.g., 'Monaco', 'Silverstone')",
    )
