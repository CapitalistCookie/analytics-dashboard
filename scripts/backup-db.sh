#!/bin/bash
# Database backup script for Analytics Dashboard

BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "=========================================="
echo "   Analytics Dashboard Backup"
echo "=========================================="
echo "Backup directory: $BACKUP_DIR"
echo ""

# SQLite backup
echo "Backing up SQLite database..."
if docker exec analytics-backend test -f /app/data/analytics.db 2>/dev/null; then
    docker cp analytics-backend:/app/data/analytics.db "$BACKUP_DIR/analytics.db"
    echo "  SQLite: OK ($(du -h "$BACKUP_DIR/analytics.db" | cut -f1))"
else
    echo "  SQLite: Not found or backend not running"
fi

# InfluxDB backup
echo ""
echo "Backing up InfluxDB..."
if docker exec influxdb influx version >/dev/null 2>&1; then
    docker exec influxdb influx backup /tmp/influx-backup --org frigate 2>/dev/null
    docker cp influxdb:/tmp/influx-backup "$BACKUP_DIR/influxdb/"
    docker exec influxdb rm -rf /tmp/influx-backup 2>/dev/null
    echo "  InfluxDB: OK"
else
    echo "  InfluxDB: Container not running"
fi

# Frigate config backup
echo ""
echo "Backing up Frigate config..."
if [ -f frigate/config/config.yml ]; then
    cp -r frigate/config "$BACKUP_DIR/frigate-config"
    echo "  Frigate config: OK"
else
    echo "  Frigate config: Not found"
fi

# Environment backup (sanitized)
echo ""
echo "Backing up environment (sanitized)..."
if [ -f .env ]; then
    # Remove sensitive values
    sed 's/=.*/=REDACTED/' .env > "$BACKUP_DIR/env.backup"
    echo "  Environment: OK (values redacted)"
fi

echo ""
echo "=========================================="
echo "Backup complete: $BACKUP_DIR"
echo "=========================================="
ls -la "$BACKUP_DIR"
