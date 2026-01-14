#!/bin/bash
# Check current time on all Hikvision cameras
# Usage: ./check_hikvision_time.sh

HIKVISION_USER="admin"
HIKVISION_PASS="jmj55555"

# Hikvision camera IPs
HIKVISION_CAMERAS=(
    "192.168.1.9"    # cam_009
    "192.168.1.26"   # cam_026
    "192.168.1.28"   # cam_028
    "192.168.1.40"   # cam_040
    "192.168.1.54"   # cam_054
    "192.168.1.60"   # cam_060
    "192.168.1.68"   # cam_068
    "192.168.1.89"   # cam_089
    "192.168.1.108"  # cam_108
    "192.168.1.179"  # cam_179
    "192.168.1.192"  # cam_192
)

SERVER_TIME=$(date +"%Y-%m-%d %H:%M:%S")
echo "Server time: $SERVER_TIME"
echo "=================================="
printf "%-15s %-22s %s\n" "CAMERA IP" "CAMERA TIME" "DRIFT"
echo "----------------------------------"

for IP in "${HIKVISION_CAMERAS[@]}"; do
    RESPONSE=$(curl -s --digest -u "$HIKVISION_USER:$HIKVISION_PASS" \
        --connect-timeout 3 \
        "http://$IP/ISAPI/System/time" 2>&1)

    if echo "$RESPONSE" | grep -q "localTime"; then
        CAM_TIME=$(echo "$RESPONSE" | grep -oP '(?<=<localTime>)[^<]+' | sed 's/T/ /')

        # Calculate drift in seconds
        SERVER_EPOCH=$(date -d "$SERVER_TIME" +%s 2>/dev/null)
        CAM_EPOCH=$(date -d "$CAM_TIME" +%s 2>/dev/null)

        if [ -n "$SERVER_EPOCH" ] && [ -n "$CAM_EPOCH" ]; then
            DRIFT=$((CAM_EPOCH - SERVER_EPOCH))
            if [ $DRIFT -gt 0 ]; then
                DRIFT_STR="+${DRIFT}s"
            else
                DRIFT_STR="${DRIFT}s"
            fi
        else
            DRIFT_STR="?"
        fi

        printf "%-15s %-22s %s\n" "$IP" "$CAM_TIME" "$DRIFT_STR"
    else
        printf "%-15s %-22s\n" "$IP" "(unreachable)"
    fi
done

echo "=================================="
