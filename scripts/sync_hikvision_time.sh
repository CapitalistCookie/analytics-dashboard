#!/bin/bash
# Sync time on all Hikvision cameras
# Usage: ./sync_hikvision_time.sh
#
# Note: Cameras are in CST+8 timezone (Asia/Shanghai), server is in PST-8
# This script converts server time to camera timezone

HIKVISION_USER="admin"
HIKVISION_PASS="jmj55555"

# Get current time in camera timezone (+08:00)
# Server is PST (-08:00), cameras are CST (+08:00) = 16 hours ahead
CAMERA_TIME=$(TZ=Asia/Shanghai date +"%Y-%m-%dT%H:%M:%S+08:00")

# Hikvision camera IPs (11 cameras)
HIKVISION_CAMERAS=(
    "192.168.1.9"    # cam_009 - Entry
    "192.168.1.26"   # cam_026 - Behind bar
    "192.168.1.28"   # cam_028 - VIP wine room
    "192.168.1.40"   # cam_040 - Cashier
    "192.168.1.54"   # cam_054 - Hallway
    "192.168.1.60"   # cam_060 - Back hallway
    "192.168.1.68"   # cam_068 - Storage
    "192.168.1.89"   # cam_089 - Office
    "192.168.1.108"  # cam_108 - Food pickup
    "192.168.1.179"  # cam_179 - Patio
    "192.168.1.192"  # cam_192 - Seating
)

echo "Server time (PST): $(date +"%Y-%m-%d %H:%M:%S %Z")"
echo "Camera time (CST): $CAMERA_TIME"
echo "=================================="

for IP in "${HIKVISION_CAMERAS[@]}"; do
    echo -n "Syncing $IP... "

    RESPONSE=$(curl -s --digest -u "$HIKVISION_USER:$HIKVISION_PASS" \
        --connect-timeout 5 \
        -X PUT \
        -H "Content-Type: application/xml" \
        -d "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<Time version=\"2.0\" xmlns=\"http://www.hikvision.com/ver20/XMLSchema\">
<timeMode>manual</timeMode>
<localTime>$CAMERA_TIME</localTime>
<timeZone>CST-8:00:00</timeZone>
</Time>" \
        "http://$IP/ISAPI/System/time" 2>&1)

    if echo "$RESPONSE" | grep -q "<statusCode>1</statusCode>"; then
        echo "OK"
    elif echo "$RESPONSE" | grep -q "timeout\|Connection refused"; then
        echo "FAILED (unreachable)"
    else
        echo "FAILED"
    fi
done

echo "=================================="
echo "Done!"
