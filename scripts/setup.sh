#!/bin/bash
set -e

echo "=========================================="
echo "   Analytics Dashboard Setup Script"
echo "=========================================="

# Check prerequisites
echo "Checking prerequisites..."

command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker required but not installed."; exit 1; }
echo "  Docker: OK"

if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD="docker-compose"
elif docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
else
    echo "ERROR: Docker Compose required but not installed."
    exit 1
fi
echo "  Docker Compose: OK"

# Check for NVIDIA GPU
if nvidia-smi >/dev/null 2>&1; then
    echo "  NVIDIA GPU: OK"
else
    echo "  WARNING: No NVIDIA GPU detected. Detection will use CPU (slower)."
fi

# Check for .env
if [ ! -f .env ]; then
    echo ""
    echo "Creating .env from template..."
    cp .env.example .env
    echo "=========================================="
    echo "  IMPORTANT: Please edit .env with your"
    echo "  actual credentials before continuing!"
    echo "=========================================="
    echo ""
    echo "Run this script again after editing .env"
    exit 1
fi
echo "  .env file: OK"

# Create required directories
echo ""
echo "Creating directories..."
mkdir -p frigate/config mosquitto/config backups

# Build containers
echo ""
echo "Building containers (this may take a few minutes)..."
$COMPOSE_CMD -f docker-compose.full.yml build

# Start services
echo ""
echo "Starting services..."
$COMPOSE_CMD -f docker-compose.full.yml up -d

echo ""
echo "Waiting for services to start (30 seconds)..."
sleep 30

# Check health
echo ""
echo "Checking service health..."

if curl -s http://localhost:8000/api/health >/dev/null 2>&1; then
    echo "  Backend: OK"
else
    echo "  Backend: Starting..."
fi

if curl -s http://localhost:5000/api/stats >/dev/null 2>&1; then
    echo "  Frigate: OK"
else
    echo "  Frigate: Starting..."
fi

if curl -s http://localhost:8086/health >/dev/null 2>&1; then
    echo "  InfluxDB: OK"
else
    echo "  InfluxDB: Starting..."
fi

if curl -s http://localhost:3000 >/dev/null 2>&1; then
    echo "  Frontend: OK"
else
    echo "  Frontend: Starting..."
fi

echo ""
echo "=========================================="
echo "   Setup Complete!"
echo "=========================================="
echo ""
echo "  Dashboard:  http://localhost:3000"
echo "  API:        http://localhost:8000"
echo "  Frigate:    http://localhost:5000"
echo "  InfluxDB:   http://localhost:8086"
echo ""
echo "  View logs:  docker compose -f docker-compose.full.yml logs -f"
echo "  Stop:       docker compose -f docker-compose.full.yml down"
echo ""
