#!/bin/bash
# Enable NTP on Hikvision cameras for automatic time sync
# Usage: ./enable_hikvision_ntp.sh [ntp_server]
# Default NTP server: pool.ntp.org
#
# Note: This is the long-term solution - cameras will auto-sync every 60 min

HIKVISION_USER="admin"
HIKVISION_PASS="jmj55555"
NTP_SERVER="${1:-pool.ntp.org}"

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

echo "Enabling NTP with server: $NTP_SERVER"
echo "======================================="

for IP in "${HIKVISION_CAMERAS[@]}"; do
    echo -n "Configuring NTP on $IP... "

    # Set time mode to NTP
    RESPONSE=$(curl -s --digest -u "$HIKVISION_USER:$HIKVISION_PASS" \
        --connect-timeout 5 \
        -X PUT \
        -H "Content-Type: application/xml" \
        -d "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<Time version=\"2.0\" xmlns=\"http://www.hikvision.com/ver20/XMLSchema\">
<timeMode>NTP</timeMode>
<timeZone>CST-8:00:00</timeZone>
</Time>" \
        "http://$IP/ISAPI/System/time" 2>&1)

    # Configure NTP server
    curl -s --digest -u "$HIKVISION_USER:$HIKVISION_PASS" \
        --connect-timeout 5 \
        -X PUT \
        -H "Content-Type: application/xml" \
        -d "<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<NTPServer version=\"2.0\" xmlns=\"http://www.hikvision.com/ver20/XMLSchema\">
<id>1</id>
<addressingFormatType>hostname</addressingFormatType>
<hostName>$NTP_SERVER</hostName>
<portNo>123</portNo>
<synchronizeInterval>60</synchronizeInterval>
</NTPServer>" \
        "http://$IP/ISAPI/System/time/ntpServers/1" >/dev/null 2>&1

    if echo "$RESPONSE" | grep -q "<statusCode>1</statusCode>"; then
        echo "OK"
    elif echo "$RESPONSE" | grep -q "timeout\|Connection refused"; then
        echo "FAILED (unreachable)"
    else
        echo "FAILED"
    fi
done

echo "======================================="
echo "Done! Cameras will sync time via NTP every 60 minutes."
echo "Note: First sync may take a few minutes."
