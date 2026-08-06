#!/usr/bin/env bash

# Define colors for beautiful logs
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${CYAN}================================================================${NC}"
echo -e "${CYAN}   🎮  NPC COGNITIVE ARCHITECTURE & RPG FRAMEWORK STARTUP  🎮   ${NC}"
echo -e "${CYAN}================================================================${NC}"

# Check for LLM Server
echo -e "${YELLOW}[System] Checking configuration...${NC}"
echo -e "${YELLOW}[System] Reminder: Ensure your Local LLM Server is running at http://localhost:8085/v1/chat/completions${NC}"

# Resolve directories
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"

# --- Backend Checks ---
if [ -d "$BACKEND_DIR/venv" ]; then
    PYTHON_BIN="$BACKEND_DIR/venv/bin/python"
    echo -e "${GREEN}[Backend] Found python virtual environment at backend/venv${NC}"
else
    PYTHON_BIN="python3"
    echo -e "${RED}[Backend] Virtual environment not found at backend/venv. Falling back to system python3...${NC}"
fi

# --- Frontend Checks ---
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    echo -e "${YELLOW}[Frontend] node_modules not found in frontend/. Installing dependencies first...${NC}"
    cd "$FRONTEND_DIR" && npm install
    cd "$SCRIPT_DIR"
fi

# --- Start Services ---
echo -e "${CYAN}[System] Starting Backend & Frontend services...${NC}"

# Start Backend
cd "$BACKEND_DIR"
$PYTHON_BIN app.py 2>&1 | sed -u "s/^/$(echo -e "${GREEN}[Backend]${NC}") /" &
BACKEND_PID=$!
cd "$SCRIPT_DIR"

# Start Frontend
cd "$FRONTEND_DIR"
npm run dev 2>&1 | sed -u "s/^/$(echo -e "${BLUE}[Frontend]${NC}") /" &
FRONTEND_PID=$!
cd "$SCRIPT_DIR"

# Cleanup function on Ctrl+C (SIGINT/SIGTERM)
cleanup() {
    echo -e "\n${RED}[System] Shutting down services...${NC}"
    echo -e "${RED}[System] Terminating Backend (PID: $BACKEND_PID)...${NC}"
    kill $BACKEND_PID 2>/dev/null
    echo -e "${RED}[System] Terminating Frontend (PID: $FRONTEND_PID)...${NC}"
    kill $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}[System] Services stopped. Have a legendary day! 🧙‍♂️${NC}"
    exit 0
}

# Trap signals
trap cleanup SIGINT SIGTERM

# Keep script running and wait for background processes
wait $BACKEND_PID $FRONTEND_PID
