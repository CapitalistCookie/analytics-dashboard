#!/bin/bash
# Restart all services

echo "Restarting all Analytics Dashboard services..."

if [ -f docker-compose.full.yml ]; then
    COMPOSE_FILE="docker-compose.full.yml"
else
    COMPOSE_FILE="docker-compose.yml"
fi

docker compose -f "$COMPOSE_FILE" restart

echo ""
echo "Waiting for services to be ready (15 seconds)..."
sleep 15

echo ""
echo "Service Status:"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "Quick Health Check:"
curl -s http://localhost:8000/api/health 2>/dev/null | python3 -m json.tool 2>/dev/null || echo "Backend: Still starting..."
