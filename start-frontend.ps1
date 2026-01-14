# F1 Briefing Agent - Frontend Startup Script

Write-Host "Starting F1 Briefing Agent Frontend..." -ForegroundColor Green
Write-Host ""

# Change to frontend directory
Set-Location -Path "frontend"

# Check if node_modules exists
if (-Not (Test-Path "node_modules")) {
    Write-Host "Node modules not found. Installing..." -ForegroundColor Yellow
    npm install
}

# Start the frontend
Write-Host ""
Write-Host "Starting Next.js development server on http://localhost:3000" -ForegroundColor Green
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""

npm run dev
