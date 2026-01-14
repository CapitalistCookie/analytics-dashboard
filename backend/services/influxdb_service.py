"""InfluxDB Analytics Service for querying time-series data."""

from datetime import datetime, timedelta
from typing import Optional
import logging

from database import InfluxDBConnection, INFLUXDB_BUCKET, INFLUXDB_ORG
from cache import cached_query

logger = logging.getLogger(__name__)

# TTL Constants (in seconds)
TTL_5_MIN = 300      # hourly traffic, zone activity, dwell times
TTL_10_MIN = 600     # occupancy history, dwell distribution
TTL_1_HOUR = 3600    # peak hours, heatmap, daily traffic, summary


class InfluxDBAnalyticsService:
    """Service for querying analytics data from InfluxDB."""

    @staticmethod
    def _format_date(date: datetime) -> str:
        """Format datetime for InfluxDB query."""
        return date.strftime("%Y-%m-%dT%H:%M:%SZ")

    @staticmethod
    def _parse_date(date_str: str) -> datetime:
        """Parse YYYY-MM-DD date string."""
        return datetime.strptime(date_str, "%Y-%m-%d")

    @classmethod
    @cached_query(ttl=TTL_5_MIN)
    def get_hourly_traffic(cls, date: str) -> list[dict]:
        """Get hourly traffic counts for a specific date.

        Args:
            date: Date in YYYY-MM-DD format

        Returns:
            List of {hour, customers, staff} dicts
        """
        try:
            query_api = InfluxDBConnection.get_query_api()
            target_date = cls._parse_date(date)
            start_time = cls._format_date(target_date)
            end_time = cls._format_date(target_date + timedelta(days=1))

            # Query person_detection for hourly counts
            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: {start_time}, stop: {end_time})
                |> filter(fn: (r) => r._measurement == "person_detection")
                |> filter(fn: (r) => r._field == "confidence")
                |> group(columns: ["classification"])
                |> aggregateWindow(every: 1h, fn: count, createEmpty: true)
                |> yield(name: "hourly_traffic")
            '''

            result = query_api.query(query, org=INFLUXDB_ORG)

            # Initialize hourly data
            hourly_data = {}
            for hour in range(24):
                hourly_data[hour] = {"hour": f"{hour:02d}:00", "customers": 0, "staff": 0}

            for table in result:
                for record in table.records:
                    hour = record.get_time().hour
                    classification = record.values.get("classification", "customer")
                    count = int(record.get_value() or 0)

                    if classification == "staff":
                        hourly_data[hour]["staff"] += count
                    else:
                        hourly_data[hour]["customers"] += count

            return list(hourly_data.values())

        except Exception as e:
            logger.error(f"Error getting hourly traffic: {e}")
            return [{"hour": f"{h:02d}:00", "customers": 0, "staff": 0} for h in range(24)]

    @classmethod
    @cached_query(ttl=TTL_1_HOUR)
    def get_daily_traffic(cls, start_date: str, end_date: str) -> list[dict]:
        """Get daily traffic counts for a date range.

        Args:
            start_date: Start date in YYYY-MM-DD format
            end_date: End date in YYYY-MM-DD format

        Returns:
            List of {date, customers, staff} dicts
        """
        try:
            query_api = InfluxDBConnection.get_query_api()
            start = cls._parse_date(start_date)
            end = cls._parse_date(end_date) + timedelta(days=1)

            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: {cls._format_date(start)}, stop: {cls._format_date(end)})
                |> filter(fn: (r) => r._measurement == "person_detection")
                |> filter(fn: (r) => r._field == "confidence")
                |> group(columns: ["classification"])
                |> aggregateWindow(every: 1d, fn: count, createEmpty: true)
                |> yield(name: "daily_traffic")
            '''

            result = query_api.query(query, org=INFLUXDB_ORG)

            # Build daily data
            daily_data = {}
            current = start
            while current < end:
                date_str = current.strftime("%Y-%m-%d")
                daily_data[date_str] = {"date": date_str, "customers": 0, "staff": 0}
                current += timedelta(days=1)

            for table in result:
                for record in table.records:
                    date_str = record.get_time().strftime("%Y-%m-%d")
                    if date_str in daily_data:
                        classification = record.values.get("classification", "customer")
                        count = int(record.get_value() or 0)

                        if classification == "staff":
                            daily_data[date_str]["staff"] += count
                        else:
                            daily_data[date_str]["customers"] += count

            return list(daily_data.values())

        except Exception as e:
            logger.error(f"Error getting daily traffic: {e}")
            return []

    @classmethod
    @cached_query(ttl=TTL_5_MIN)
    def get_traffic_by_camera(cls, date: str) -> list[dict]:
        """Get traffic counts by camera for a specific date.

        Args:
            date: Date in YYYY-MM-DD format

        Returns:
            List of {camera, count, percentage} dicts
        """
        try:
            query_api = InfluxDBConnection.get_query_api()
            target_date = cls._parse_date(date)
            start_time = cls._format_date(target_date)
            end_time = cls._format_date(target_date + timedelta(days=1))

            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: {start_time}, stop: {end_time})
                |> filter(fn: (r) => r._measurement == "person_detection")
                |> filter(fn: (r) => r._field == "confidence")
                |> group(columns: ["camera"])
                |> count()
                |> yield(name: "camera_traffic")
            '''

            result = query_api.query(query, org=INFLUXDB_ORG)

            camera_counts = []
            total = 0

            for table in result:
                for record in table.records:
                    camera = record.values.get("camera", "unknown")
                    count = int(record.get_value() or 0)
                    camera_counts.append({"camera": camera, "count": count})
                    total += count

            # Calculate percentages
            for item in camera_counts:
                item["percentage"] = round((item["count"] / total * 100) if total > 0 else 0, 1)

            # Sort by count descending
            camera_counts.sort(key=lambda x: x["count"], reverse=True)

            return camera_counts

        except Exception as e:
            logger.error(f"Error getting traffic by camera: {e}")
            return []

    @classmethod
    @cached_query(ttl=TTL_5_MIN)
    def get_zone_activity(cls, date: Optional[str] = None, days: int = 1) -> list[dict]:
        """Get zone activity counts.

        Args:
            date: Optional specific date (YYYY-MM-DD)
            days: Number of days to query if date not specified

        Returns:
            List of {zone, count, percentage} dicts
        """
        try:
            query_api = InfluxDBConnection.get_query_api()

            if date:
                target_date = cls._parse_date(date)
                start_time = cls._format_date(target_date)
                end_time = cls._format_date(target_date + timedelta(days=1))
                range_filter = f"range(start: {start_time}, stop: {end_time})"
            else:
                range_filter = f"range(start: -{days}d)"

            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> {range_filter}
                |> filter(fn: (r) => r._measurement == "zone_activity")
                |> filter(fn: (r) => r._field == "person_count" or r._field == "dwell_time")
                |> group(columns: ["zone"])
                |> count()
                |> yield(name: "zone_counts")
            '''

            result = query_api.query(query, org=INFLUXDB_ORG)

            zone_counts = []
            total = 0

            for table in result:
                for record in table.records:
                    zone = record.values.get("zone", "unknown")
                    count = int(record.get_value() or 0)
                    zone_counts.append({"zone": zone, "count": count})
                    total += count

            # Calculate percentages and activity level (0-100 scale)
            max_count = max((z["count"] for z in zone_counts), default=1)
            for item in zone_counts:
                item["percentage"] = round((item["count"] / total * 100) if total > 0 else 0, 1)
                item["activity"] = round((item["count"] / max_count * 100) if max_count > 0 else 0)

            # Sort by count descending
            zone_counts.sort(key=lambda x: x["count"], reverse=True)

            return zone_counts

        except Exception as e:
            logger.error(f"Error getting zone activity: {e}")
            return []

    @classmethod
    @cached_query(ttl=TTL_5_MIN)
    def get_dwell_times_by_zone(cls, date: Optional[str] = None, days: int = 1) -> list[dict]:
        """Get average dwell times by zone.

        Args:
            date: Optional specific date (YYYY-MM-DD)
            days: Number of days to query if date not specified

        Returns:
            List of {zone, avg_dwell_seconds, avg_dwell_minutes} dicts
        """
        try:
            query_api = InfluxDBConnection.get_query_api()

            if date:
                target_date = cls._parse_date(date)
                start_time = cls._format_date(target_date)
                end_time = cls._format_date(target_date + timedelta(days=1))
                range_filter = f"range(start: {start_time}, stop: {end_time})"
            else:
                range_filter = f"range(start: -{days}d)"

            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> {range_filter}
                |> filter(fn: (r) => r._measurement == "zone_activity")
                |> filter(fn: (r) => r._field == "dwell_time")
                |> group(columns: ["zone"])
                |> mean()
                |> yield(name: "avg_dwell")
            '''

            result = query_api.query(query, org=INFLUXDB_ORG)

            dwell_times = []

            for table in result:
                for record in table.records:
                    zone = record.values.get("zone", "unknown")
                    avg_dwell = float(record.get_value() or 0)
                    dwell_times.append({
                        "zone": zone,
                        "avg_dwell_seconds": round(avg_dwell, 1),
                        "avg_dwell_minutes": round(avg_dwell / 60, 1)
                    })

            # Sort by dwell time descending
            dwell_times.sort(key=lambda x: x["avg_dwell_seconds"], reverse=True)

            return dwell_times

        except Exception as e:
            logger.error(f"Error getting dwell times: {e}")
            return []

    @classmethod
    @cached_query(ttl=TTL_5_MIN)
    def get_average_dwell_time(cls, date: Optional[str] = None, days: int = 1) -> dict:
        """Get overall average dwell time.

        Returns:
            Dict with avg_seconds, avg_minutes, total_events
        """
        try:
            query_api = InfluxDBConnection.get_query_api()

            if date:
                target_date = cls._parse_date(date)
                start_time = cls._format_date(target_date)
                end_time = cls._format_date(target_date + timedelta(days=1))
                range_filter = f"range(start: {start_time}, stop: {end_time})"
            else:
                range_filter = f"range(start: -{days}d)"

            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> {range_filter}
                |> filter(fn: (r) => r._measurement == "zone_activity")
                |> filter(fn: (r) => r._field == "dwell_time")
                |> mean()
                |> yield(name: "overall_avg")
            '''

            result = query_api.query(query, org=INFLUXDB_ORG)

            avg_dwell = 0.0
            for table in result:
                for record in table.records:
                    avg_dwell = float(record.get_value() or 0)

            # Get count
            count_query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> {range_filter}
                |> filter(fn: (r) => r._measurement == "zone_activity")
                |> filter(fn: (r) => r._field == "dwell_time")
                |> count()
            '''

            count_result = query_api.query(count_query, org=INFLUXDB_ORG)
            total_events = 0
            for table in count_result:
                for record in table.records:
                    total_events = int(record.get_value() or 0)

            return {
                "avg_seconds": round(avg_dwell, 1),
                "avg_minutes": round(avg_dwell / 60, 1),
                "total_events": total_events
            }

        except Exception as e:
            logger.error(f"Error getting average dwell time: {e}")
            return {"avg_seconds": 0, "avg_minutes": 0, "total_events": 0}

    @classmethod
    @cached_query(ttl=TTL_10_MIN)
    def get_dwell_distribution(cls, date: Optional[str] = None, days: int = 1) -> list[dict]:
        """Get dwell time distribution in buckets.

        Returns:
            List of {bucket, count, percentage} dicts
        """
        try:
            query_api = InfluxDBConnection.get_query_api()

            if date:
                target_date = cls._parse_date(date)
                start_time = cls._format_date(target_date)
                end_time = cls._format_date(target_date + timedelta(days=1))
                range_filter = f"range(start: {start_time}, stop: {end_time})"
            else:
                range_filter = f"range(start: -{days}d)"

            # Get all dwell times and bucket them client-side
            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> {range_filter}
                |> filter(fn: (r) => r._measurement == "zone_activity")
                |> filter(fn: (r) => r._field == "dwell_time")
                |> yield(name: "dwell_times")
            '''

            result = query_api.query(query, org=INFLUXDB_ORG)

            # Define buckets (in seconds)
            buckets = {
                "0-30s": {"min": 0, "max": 30, "count": 0},
                "30s-2min": {"min": 30, "max": 120, "count": 0},
                "2-5min": {"min": 120, "max": 300, "count": 0},
                "5-15min": {"min": 300, "max": 900, "count": 0},
                "15-30min": {"min": 900, "max": 1800, "count": 0},
                "30+min": {"min": 1800, "max": float('inf'), "count": 0},
            }

            total = 0
            for table in result:
                for record in table.records:
                    dwell = float(record.get_value() or 0)
                    total += 1

                    for bucket_name, bucket_data in buckets.items():
                        if bucket_data["min"] <= dwell < bucket_data["max"]:
                            bucket_data["count"] += 1
                            break

            # Convert to list with percentages
            distribution = []
            for bucket_name, bucket_data in buckets.items():
                distribution.append({
                    "bucket": bucket_name,
                    "count": bucket_data["count"],
                    "percentage": round((bucket_data["count"] / total * 100) if total > 0 else 0, 1)
                })

            return distribution

        except Exception as e:
            logger.error(f"Error getting dwell distribution: {e}")
            return []

    @classmethod
    @cached_query(ttl=TTL_1_HOUR)
    def get_peak_hours(cls, days: int = 7) -> list[dict]:
        """Get peak hours analysis over a period.

        Args:
            days: Number of days to analyze

        Returns:
            List of {hour, avg_count, day_breakdown} dicts
        """
        try:
            query_api = InfluxDBConnection.get_query_api()

            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: -{days}d)
                |> filter(fn: (r) => r._measurement == "person_detection")
                |> filter(fn: (r) => r._field == "confidence")
                |> group()
                |> aggregateWindow(every: 1h, fn: count, createEmpty: true)
                |> yield(name: "hourly_counts")
            '''

            result = query_api.query(query, org=INFLUXDB_ORG)

            # Aggregate by hour of day
            hourly_totals = {h: {"total": 0, "days": 0} for h in range(24)}

            for table in result:
                for record in table.records:
                    hour = record.get_time().hour
                    count = int(record.get_value() or 0)
                    if count > 0:
                        hourly_totals[hour]["total"] += count
                        hourly_totals[hour]["days"] += 1

            # Calculate averages
            peak_hours = []
            for hour in range(24):
                data = hourly_totals[hour]
                avg_count = data["total"] / data["days"] if data["days"] > 0 else 0
                peak_hours.append({
                    "hour": f"{hour:02d}:00",
                    "avg_count": round(avg_count, 1),
                    "total_count": data["total"]
                })

            return peak_hours

        except Exception as e:
            logger.error(f"Error getting peak hours: {e}")
            return [{"hour": f"{h:02d}:00", "avg_count": 0, "total_count": 0} for h in range(24)]

    @classmethod
    @cached_query(ttl=TTL_1_HOUR)
    def get_day_hour_heatmap(cls, days: int = 7) -> list[dict]:
        """Get day/hour heatmap data for visualization.

        Returns:
            List of {day_of_week, hour, count} for heatmap
        """
        try:
            query_api = InfluxDBConnection.get_query_api()

            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: -{days}d)
                |> filter(fn: (r) => r._measurement == "person_detection")
                |> filter(fn: (r) => r._field == "confidence")
                |> group()
                |> aggregateWindow(every: 1h, fn: count, createEmpty: true)
                |> yield(name: "hourly_counts")
            '''

            result = query_api.query(query, org=INFLUXDB_ORG)

            # Initialize grid [day][hour]
            day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
            grid = {day: {h: 0 for h in range(24)} for day in range(7)}

            for table in result:
                for record in table.records:
                    dt = record.get_time()
                    day = dt.weekday()
                    hour = dt.hour
                    count = int(record.get_value() or 0)
                    grid[day][hour] += count

            # Convert to list format for frontend
            heatmap_data = []
            for day in range(7):
                for hour in range(24):
                    heatmap_data.append({
                        "day": day_names[day],
                        "day_index": day,
                        "hour": hour,
                        "count": grid[day][hour]
                    })

            return heatmap_data

        except Exception as e:
            logger.error(f"Error getting day/hour heatmap: {e}")
            return []

    @classmethod
    def get_current_occupancy(cls) -> dict:
        """Get current real-time occupancy.

        Returns:
            Dict with total, by_zone, by_camera, timestamp
        """
        try:
            query_api = InfluxDBConnection.get_query_api()

            # Get recent detections (last 5 minutes) to estimate current occupancy
            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: -5m)
                |> filter(fn: (r) => r._measurement == "person_detection")
                |> filter(fn: (r) => r._field == "confidence")
                |> group(columns: ["camera"])
                |> distinct(column: "track_id")
                |> count()
                |> yield(name: "current_count")
            '''

            result = query_api.query(query, org=INFLUXDB_ORG)

            by_camera = {}
            total = 0

            for table in result:
                for record in table.records:
                    camera = record.values.get("camera", "unknown")
                    count = int(record.get_value() or 0)
                    by_camera[camera] = count
                    total += count

            # Get zone breakdown from zone_activity
            zone_query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: -5m)
                |> filter(fn: (r) => r._measurement == "zone_activity")
                |> filter(fn: (r) => r._field == "person_count")
                |> group(columns: ["zone"])
                |> last()
                |> yield(name: "zone_counts")
            '''

            zone_result = query_api.query(zone_query, org=INFLUXDB_ORG)

            by_zone = {}
            for table in zone_result:
                for record in table.records:
                    zone = record.values.get("zone", "unknown")
                    count = int(record.get_value() or 0)
                    by_zone[zone] = count

            return {
                "total": total,
                "by_camera": by_camera,
                "by_zone": by_zone,
                "timestamp": datetime.utcnow().isoformat(),
                "source": "influxdb"
            }

        except Exception as e:
            logger.error(f"Error getting current occupancy: {e}")
            return {
                "total": 0,
                "by_camera": {},
                "by_zone": {},
                "timestamp": datetime.utcnow().isoformat(),
                "source": "error"
            }

    @classmethod
    @cached_query(ttl=TTL_10_MIN)
    def get_occupancy_history(cls, date: str) -> list[dict]:
        """Get occupancy history for a specific date.

        Args:
            date: Date in YYYY-MM-DD format

        Returns:
            List of {timestamp, count} dicts (5-minute intervals)
        """
        try:
            query_api = InfluxDBConnection.get_query_api()
            target_date = cls._parse_date(date)
            start_time = cls._format_date(target_date)
            end_time = cls._format_date(target_date + timedelta(days=1))

            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: {start_time}, stop: {end_time})
                |> filter(fn: (r) => r._measurement == "person_detection")
                |> filter(fn: (r) => r._field == "confidence")
                |> group()
                |> aggregateWindow(every: 5m, fn: count, createEmpty: true)
                |> yield(name: "occupancy_history")
            '''

            result = query_api.query(query, org=INFLUXDB_ORG)

            history = []
            for table in result:
                for record in table.records:
                    history.append({
                        "timestamp": record.get_time().isoformat(),
                        "count": int(record.get_value() or 0)
                    })

            # Sort by timestamp
            history.sort(key=lambda x: x["timestamp"])

            return history

        except Exception as e:
            logger.error(f"Error getting occupancy history: {e}")
            return []

    @classmethod
    @cached_query(ttl=TTL_1_HOUR)
    def get_analytics_summary(cls, date: str) -> dict:
        """Get summary analytics for a specific date.

        Args:
            date: Date in YYYY-MM-DD format

        Returns:
            Dict with total_visitors, avg_dwell, peak_hour, busiest_zone
        """
        try:
            query_api = InfluxDBConnection.get_query_api()
            target_date = cls._parse_date(date)
            start_time = cls._format_date(target_date)
            end_time = cls._format_date(target_date + timedelta(days=1))

            # Get total unique visitors (by track_id)
            visitor_query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: {start_time}, stop: {end_time})
                |> filter(fn: (r) => r._measurement == "person_detection")
                |> filter(fn: (r) => r._field == "confidence")
                |> distinct(column: "track_id")
                |> count()
            '''

            visitor_result = query_api.query(visitor_query, org=INFLUXDB_ORG)
            total_visitors = 0
            for table in visitor_result:
                for record in table.records:
                    total_visitors = int(record.get_value() or 0)

            # Get average dwell time
            dwell_data = cls.get_average_dwell_time(date=date)
            avg_dwell = dwell_data.get("avg_minutes", 0)

            # Get peak hour
            hourly_data = cls.get_hourly_traffic(date)
            peak_hour_data = max(hourly_data, key=lambda x: x["customers"]) if hourly_data else {"hour": "12:00", "customers": 0}
            peak_hour = peak_hour_data["hour"]
            peak_count = peak_hour_data["customers"]

            # Convert 24h to 12h format for display
            hour_int = int(peak_hour.split(":")[0])
            if hour_int == 0:
                peak_hour_display = "12:00 AM"
            elif hour_int < 12:
                peak_hour_display = f"{hour_int}:00 AM"
            elif hour_int == 12:
                peak_hour_display = "12:00 PM"
            else:
                peak_hour_display = f"{hour_int - 12}:00 PM"

            # Get busiest zone
            zone_data = cls.get_zone_activity(date=date)
            busiest_zone = zone_data[0]["zone"] if zone_data else "N/A"

            # Get comparison with yesterday
            yesterday = (target_date - timedelta(days=1)).strftime("%Y-%m-%d")
            yesterday_hourly = cls.get_hourly_traffic(yesterday)
            yesterday_total = sum(h["customers"] for h in yesterday_hourly)
            today_total = sum(h["customers"] for h in hourly_data)

            change_percent = 0
            if yesterday_total > 0:
                change_percent = round((today_total - yesterday_total) / yesterday_total * 100, 1)

            return {
                "total_visitors": total_visitors,
                "total_detections": today_total,
                "avg_dwell_minutes": round(avg_dwell, 1),
                "peak_hour": peak_hour_display,
                "peak_hour_count": peak_count,
                "busiest_zone": busiest_zone,
                "vs_yesterday_percent": change_percent,
                "date": date
            }

        except Exception as e:
            logger.error(f"Error getting analytics summary: {e}")
            return {
                "total_visitors": 0,
                "total_detections": 0,
                "avg_dwell_minutes": 0,
                "peak_hour": "N/A",
                "peak_hour_count": 0,
                "busiest_zone": "N/A",
                "vs_yesterday_percent": 0,
                "date": date
            }

    @classmethod
    def export_detections_csv(cls, date: str) -> list[dict]:
        """Export detection data for CSV export.

        Args:
            date: Date in YYYY-MM-DD format

        Returns:
            List of detection records
        """
        try:
            query_api = InfluxDBConnection.get_query_api()
            target_date = cls._parse_date(date)
            start_time = cls._format_date(target_date)
            end_time = cls._format_date(target_date + timedelta(days=1))

            query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: {start_time}, stop: {end_time})
                |> filter(fn: (r) => r._measurement == "person_detection")
                |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
                |> yield(name: "detections")
            '''

            result = query_api.query(query, org=INFLUXDB_ORG)

            records = []
            for table in result:
                for record in table.records:
                    records.append({
                        "timestamp": record.get_time().isoformat(),
                        "camera": record.values.get("camera", ""),
                        "track_id": record.values.get("track_id", ""),
                        "classification": record.values.get("classification", ""),
                        "confidence": record.values.get("confidence", 0),
                        "dwell_time": record.values.get("dwell_time", 0),
                    })

            return records

        except Exception as e:
            logger.error(f"Error exporting detections: {e}")
            return []
