# F1 Briefing Agent - Backend Startup Script

Write-Host "Starting F1 Briefing Agent Backend..." -ForegroundColor Green
Write-Host ""

# Change to backend directory
Set-Location -Path "backend"

# Check if virtual environment exists
if (-Not (Test-Path "venv")) {
    Write-Host "Virtual environment not found. Creating..." -ForegroundColor Yellow
    python -m venv venv
}

# Activate virtual environment
Write-Host "Activating virtual environment..." -ForegroundColor Cyan
& ".\venv\Scripts\Activate.ps1"

# Check if requirements are installed
Write-Host "Checking dependencies..." -ForegroundColor Cyan
if (-Not (Test-Path "venv\Lib\site-packages\fastapi")) {
    Write-Host "Installing dependencies..." -ForegroundColor Yellow
    pip install -r requirements.txt
}

# Check for .env file
if (-Not (Test-Path ".env")) {
    Write-Host ""
    Write-Host "WARNING: .env file not found!" -ForegroundColor Red
    Write-Host "Please create .env file with your API keys:" -ForegroundColor Yellow
    Write-Host "  1. Copy .env.example to .env" -ForegroundColor White
    Write-Host "  2. Add your ANTHROPIC_API_KEY" -ForegroundColor White
    Write-Host "  3. Add your TAVILY_API_KEY" -ForegroundColor White
    Write-Host "  4. Add your OPENWEATHER_API_KEY" -ForegroundColor White
    Write-Host ""
    Read-Host "Press Enter after creating .env file"
}

# Start the backend
Write-Host ""
Write-Host "Starting FastAPI server on http://localhost:8000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

python main.py
