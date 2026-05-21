#!/bin/sh
echo "Starting services..."

# Start Server
echo "Starting Backend Server on port $PORT..."
node packages/server/dist/app.js &

# Start Client (serve static files)
echo "Starting Frontend Client on port 3001..."
serve packages/client/dist -p 3001 -s &

# Wait for any process to exit
wait -n

# Exit with status of process that exited first
exit $?
