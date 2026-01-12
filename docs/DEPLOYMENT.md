# Deployment Guide

Complete guide for deploying the Analytics Dashboard on a new system.

## Prerequisites

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| CPU | 4 cores | 8+ cores |
| RAM | 16GB | 32GB+ |
| GPU | GTX 1060 6GB | RTX 3070+ |
| Storage | 100GB SSD | 500GB+ SSD + HDD for recordings |

### Software Requirements

- Ubuntu 22.04 LTS (or similar Linux distribution)
- Docker Engine 24.0+
- Docker Compose v2
- NVIDIA Driver 535+
- NVIDIA Container Toolkit

### Network Requirements

- All cameras accessible on local network
- Ports available: 3000, 5000, 8000, 8086, 1883

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/YOUR_USERNAME/analytics-dashboard.git
cd analytics-dashboard

# 2. Configure environment
cp .env.example .env
nano .env  # Edit with your credentials

# 3. Configure cameras
cp frigate/config/config.example.yml frigate/config/config.yml
nano frigate/config/config.yml  # Add your camera IPs

# 4. Run setup
./scripts/setup.sh

# 5. Open dashboard
xdg-open http://localhost:3000
```

## Detailed Setup

### 1. Install Docker

```bash
# Remove old versions
sudo apt-get remove docker docker-engine docker.io containerd runc

# Install prerequisites
sudo apt-get update
sudo apt-get install ca-certificates curl gnupg lsb-release

# Add Docker's GPG key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Add repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Install NVIDIA Container Toolkit

```bash
# Add NVIDIA GPG key
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg

# Add repository
curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
  sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
  sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

# Install
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Configure Docker
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker
```

### 3. Configure Cameras

Edit `frigate/config/config.yml` with your camera details:

```yaml
cameras:
  front_entrance:
    ffmpeg:
      inputs:
        - path: rtsp://admin:password@192.168.1.100:554/stream1
          roles:
            - detect
            - record
    detect:
      width: 1920
      height: 1080
      fps: 5
    record:
      enabled: true
      retain:
        days: 7
```

### 4. Configure Environment

Edit `.env` with your credentials:

```bash
# Required changes:
INFLUXDB_PASSWORD=your_secure_password
INFLUXDB_TOKEN=generate_with_openssl_rand_hex_32
JWT_SECRET_KEY=generate_with_openssl_rand_hex_64
HIKVISION_PASSWORD=your_camera_password
CAMHI_PASSWORD=your_camera_password
```

Generate secure tokens:
```bash
openssl rand -hex 32  # For INFLUXDB_TOKEN
openssl rand -hex 64  # For JWT_SECRET_KEY
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | React dashboard |
| Backend | 8000 | FastAPI server with ReID |
| Frigate | 5000 | NVR with object detection |
| Frigate RTSP | 8554 | Camera stream restreaming |
| Frigate WebRTC | 8555 | Low-latency video |
| InfluxDB | 8086 | Time-series metrics |
| Mosquitto | 1883 | MQTT broker |

## Maintenance

### View Logs

```bash
# All services
docker compose -f docker-compose.full.yml logs -f

# Specific service
docker logs analytics-backend -f
docker logs frigate -f
```

### Backup

```bash
./scripts/backup-db.sh
```

### Restart Services

```bash
./scripts/restart.sh
# Or specific service:
docker restart analytics-backend
```

### Update

```bash
git pull
docker compose -f docker-compose.full.yml build
docker compose -f docker-compose.full.yml up -d
```

## Troubleshooting

### Memory Issues

```bash
# Check memory usage
curl http://localhost:8000/api/debug/memory

# If RSS > 1.5GB, restart
docker restart analytics-backend
```

### Camera Issues

```bash
# Check Frigate stats
curl http://localhost:5000/api/stats | python3 -m json.tool

# View camera logs
docker logs frigate 2>&1 | grep cam_001

# Power cycle CamHi cameras if green screen
```

### MQTT Issues

```bash
# Check MQTT connectivity
docker exec analytics-backend python3 -c "
import socket
s = socket.socket()
s.connect(('host.docker.internal', 1883))
print('MQTT: OK')
"

# Check Frigate publishing
docker exec mosquitto mosquitto_sub -t 'frigate/events' -C 1
```

### Detection Not Working

1. Check Frigate is receiving camera feeds
2. Verify MQTT is connected
3. Check backend logs for errors
4. Ensure GPU is being used: `nvidia-smi`

## Storage Management

### Recording Retention

Edit `frigate/config/config.yml`:

```yaml
record:
  retain:
    days: 7      # Continuous recordings
    mode: motion # Or 'all'
  events:
    retain:
      default: 14  # Event clips
```

### Disk Usage

```bash
# Check Frigate storage
du -sh /mnt/hdd/frigate/

# Check InfluxDB
docker exec influxdb du -sh /var/lib/influxdb2/
```

## Security Notes

- Change all default passwords in `.env`
- The dashboard should be behind a reverse proxy with HTTPS in production
- Consider VPN for remote access instead of exposing ports
- Regular backups are essential
