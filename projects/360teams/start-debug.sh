#!/bin/bash
# Start 360Teams with Chrome DevTools Protocol (CDP) enabled
# Required for opencli 360teams commands to work

PORT=${TEAMS_CDP_PORT:-9234}

echo "Stopping existing 360Teams instances..."
pkill -f "360Teams" 2>/dev/null
sleep 1

echo "Starting 360Teams with --remote-debugging-port=$PORT ..."
open -n /Applications/360Teams.app --args --remote-debugging-port=$PORT

echo ""
echo "360Teams started with CDP on port $PORT"
echo "Wait ~3 seconds for the app to initialize, then verify:"
echo ""
echo "  curl -s http://localhost:$PORT/json/list"
echo ""
echo "Then run: opencli 360teams status"
