"""Pydantic models for API request/response contracts."""

from pydantic import BaseModel, Field


class BriefingRequest(BaseModel):
    """Request body for briefing generation endpoints."""

    query: str = Field(
        ...,
        min_length=1,
        max_length=500,
        description="Grand Prix name or circuit identifier (e.g., 'Monaco', 'Silverstone')",
    )


class ToolTraceSummary(BaseModel):
    """Summary of a single tool execution in the agent trace."""

    tool: str
    success: bool
    summary: str


class BriefingResponse(BaseModel):
    """Response body for the synchronous briefing endpoint."""

    race: str
    briefing: str
    tool_trace: list[ToolTraceSummary]
