"""Integration tests for InfluxDB time-series database."""

import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch
import time

pytestmark = [pytest.mark.integration, pytest.mark.influxdb]


class TestInfluxDBWriteMetrics:
    """Test writing metrics to InfluxDB (mocked)."""

    def test_write_single_point(self, influxdb_write_api, sample_influx_point):
        """Test writing a single data point."""
        # Mock write operation
        influxdb_write_api.write.return_value = None

        # Should not raise
        influxdb_write_api.write(
            bucket="test-bucket",
            org="test-org",
            record=sample_influx_point
        )

        influxdb_write_api.write.assert_called_once()

    def test_write_multiple_points(self, influxdb_write_api):
        """Test writing multiple data points."""
        points = [
            {"measurement": "person_count", "tags": {"camera": f"cam_{i}"}, "fields": {"count": i}}
            for i in range(5)
        ]

        influxdb_write_api.write.return_value = None
        influxdb_write_api.write(bucket="test-bucket", org="test-org", record=points)

        influxdb_write_api.write.assert_called()

    def test_write_different_measurements(self, influxdb_write_api):
        """Test writing different measurement types."""
        measurements = [
            {"measurement": "person_count", "tags": {"camera": "lobby"}, "fields": {"count": 25}},
            {"measurement": "wait_time", "tags": {"zone": "entrance"}, "fields": {"seconds": 120}},
            {"measurement": "zone_activity", "tags": {"zone": "dining"}, "fields": {"activity_level": 75.5}}
        ]

        influxdb_write_api.write.return_value = None
        influxdb_write_api.write(bucket="test-bucket", org="test-org", record=measurements)

        influxdb_write_api.write.assert_called()


class TestInfluxDBQueryOccupancy:
    """Test querying occupancy data from InfluxDB (mocked)."""

    def test_query_current_occupancy(self, influxdb_query_api):
        """Test querying current occupancy counts."""
        # Setup mock response
        mock_record = MagicMock()
        mock_record.get_value.return_value = 42
        mock_record.values = {"camera": "test_cam"}

        mock_table = MagicMock()
        mock_table.records = [mock_record]

        influxdb_query_api.query.return_value = [mock_table]

        # Execute query
        result = influxdb_query_api.query(
            'from(bucket: "test-bucket") |> range(start: -1m) |> filter(fn: (r) => r._measurement == "person_count") |> last()',
            org="test-org"
        )

        assert result is not None
        assert len(result) == 1

    def test_query_occupancy_by_camera(self, influxdb_query_api):
        """Test querying occupancy grouped by camera."""
        # Setup mock response with multiple cameras
        mock_records = []
        for cam in ["cam1", "cam2", "cam3"]:
            record = MagicMock()
            record.get_value.return_value = 10
            record.values = {"camera": cam}
            mock_records.append(record)

        mock_table = MagicMock()
        mock_table.records = mock_records

        influxdb_query_api.query.return_value = [mock_table]

        result = influxdb_query_api.query(
            '''from(bucket: "test-bucket")
                |> range(start: -5m)
                |> filter(fn: (r) => r._measurement == "person_count")
                |> group(columns: ["camera"])''',
            org="test-org"
        )

        assert result is not None


class TestInfluxDBQueryAnalytics:
    """Test querying analytics data from InfluxDB (mocked)."""

    def test_query_hourly_aggregation(self, influxdb_query_api):
        """Test querying hourly aggregated data."""
        mock_records = []
        base_time = datetime.utcnow()

        for hour in range(3):
            record = MagicMock()
            record.get_time.return_value = base_time - timedelta(hours=hour)
            record.get_value.return_value = 20 + hour * 5
            record.values = {"camera": "main"}
            mock_records.append(record)

        mock_table = MagicMock()
        mock_table.records = mock_records

        influxdb_query_api.query.return_value = [mock_table]

        result = influxdb_query_api.query(
            '''from(bucket: "test-bucket")
                |> range(start: -24h)
                |> filter(fn: (r) => r._measurement == "person_count")
                |> aggregateWindow(every: 1h, fn: mean)''',
            org="test-org"
        )

        assert result is not None
        assert len(result[0].records) == 3

    def test_query_daily_aggregation(self, influxdb_query_api):
        """Test querying daily aggregated data."""
        mock_record = MagicMock()
        mock_record.get_time.return_value = datetime.utcnow()
        mock_record.get_value.return_value = 500

        mock_table = MagicMock()
        mock_table.records = [mock_record]

        influxdb_query_api.query.return_value = [mock_table]

        result = influxdb_query_api.query(
            '''from(bucket: "test-bucket")
                |> range(start: -7d)
                |> filter(fn: (r) => r._measurement == "person_count")
                |> aggregateWindow(every: 1d, fn: sum)''',
            org="test-org"
        )

        assert result is not None

    def test_query_zone_activity(self, influxdb_query_api):
        """Test querying zone activity levels."""
        zones = ["dining", "entrance", "kitchen", "bar"]
        mock_records = []

        for zone in zones:
            record = MagicMock()
            record.get_value.return_value = 50.0 + len(zone)
            record.values = {"zone": zone}
            mock_records.append(record)

        mock_table = MagicMock()
        mock_table.records = mock_records

        influxdb_query_api.query.return_value = [mock_table]

        result = influxdb_query_api.query(
            '''from(bucket: "test-bucket")
                |> range(start: -1h)
                |> filter(fn: (r) => r._measurement == "zone_activity")''',
            org="test-org"
        )

        assert result is not None

    def test_query_wait_times(self, influxdb_query_api):
        """Test querying wait time metrics."""
        mock_record = MagicMock()
        mock_record.get_value.return_value = 180
        mock_record.values = {"zone": "entrance"}

        mock_table = MagicMock()
        mock_table.records = [mock_record]

        influxdb_query_api.query.return_value = [mock_table]

        result = influxdb_query_api.query(
            '''from(bucket: "test-bucket")
                |> range(start: -1h)
                |> filter(fn: (r) => r._measurement == "wait_time")''',
            org="test-org"
        )

        assert result is not None


class TestInfluxDBDataRetention:
    """Test InfluxDB data retention and cleanup (mocked)."""

    def test_query_with_time_range(self, influxdb_query_api):
        """Test querying with specific time ranges."""
        influxdb_query_api.query.return_value = []

        # Query last hour
        result_1h = influxdb_query_api.query(
            'from(bucket: "test-bucket") |> range(start: -1h)',
            org="test-org"
        )
        assert result_1h is not None

        # Query last 24 hours
        result_24h = influxdb_query_api.query(
            'from(bucket: "test-bucket") |> range(start: -24h)',
            org="test-org"
        )
        assert result_24h is not None

        # Query last 7 days
        result_7d = influxdb_query_api.query(
            'from(bucket: "test-bucket") |> range(start: -7d)',
            org="test-org"
        )
        assert result_7d is not None


class TestInfluxDBConnection:
    """Test InfluxDB connection handling."""

    def test_client_health_check(self, influxdb_client):
        """Test InfluxDB client health check."""
        health = influxdb_client.health()
        assert health is not None
        assert health.status == "pass"

    def test_client_ping(self, influxdb_client):
        """Test InfluxDB client ping."""
        ping = influxdb_client.ping()
        assert ping is True


class TestInfluxDBConnectionClass:
    """Test the InfluxDBConnection singleton class."""

    def test_influxdb_connection_get_client(self):
        """Test InfluxDBConnection.get_client() returns client."""
        from database import InfluxDBConnection

        # Reset singleton state
        InfluxDBConnection._client = None

        with patch.dict('os.environ', {
            'INFLUXDB_URL': 'http://localhost:8086',
            'INFLUXDB_TOKEN': 'test-token',
            'INFLUXDB_ORG': 'test-org'
        }):
            client = InfluxDBConnection.get_client()
            assert client is not None

            # Should return same instance
            client2 = InfluxDBConnection.get_client()
            assert client is client2

        # Cleanup
        InfluxDBConnection.close()

    def test_influxdb_connection_close(self):
        """Test InfluxDBConnection.close() cleans up."""
        from database import InfluxDBConnection

        InfluxDBConnection._client = None

        with patch.dict('os.environ', {
            'INFLUXDB_URL': 'http://localhost:8086',
            'INFLUXDB_TOKEN': 'test-token',
            'INFLUXDB_ORG': 'test-org'
        }):
            _ = InfluxDBConnection.get_client()
            assert InfluxDBConnection._client is not None

            InfluxDBConnection.close()
            assert InfluxDBConnection._client is None

    def test_influxdb_connection_health_check_success(self):
        """Test InfluxDBConnection.health_check() with mocked success."""
        from database import InfluxDBConnection

        mock_client = MagicMock()
        mock_health = MagicMock()
        mock_health.status = "pass"
        mock_client.health.return_value = mock_health

        InfluxDBConnection._client = mock_client

        result = InfluxDBConnection.health_check()
        assert result is True

        InfluxDBConnection._client = None

    def test_influxdb_connection_health_check_failure(self):
        """Test InfluxDBConnection.health_check() with mocked failure."""
        from database import InfluxDBConnection

        mock_client = MagicMock()
        mock_client.health.side_effect = Exception("Connection refused")

        InfluxDBConnection._client = mock_client

        result = InfluxDBConnection.health_check()
        assert result is False

        InfluxDBConnection._client = None


class TestInfluxDBMetricsService:
    """Test metrics service integration with InfluxDB."""

    def test_store_person_count_metric(self, influxdb_write_api):
        """Test storing person count metric."""
        influxdb_write_api.write.return_value = None

        metric = {
            "measurement": "person_count",
            "tags": {"camera": "front_door", "zone": "entrance"},
            "fields": {"count": 15},
            "time": datetime.utcnow()
        }

        influxdb_write_api.write(bucket="analytics", org="restaurant", record=metric)
        influxdb_write_api.write.assert_called_once()

    def test_store_wait_time_metric(self, influxdb_write_api):
        """Test storing wait time metric."""
        influxdb_write_api.write.return_value = None

        metric = {
            "measurement": "wait_time",
            "tags": {"zone": "entrance"},
            "fields": {"average_seconds": 120, "max_seconds": 300},
            "time": datetime.utcnow()
        }

        influxdb_write_api.write(bucket="analytics", org="restaurant", record=metric)
        influxdb_write_api.write.assert_called_once()

    def test_store_zone_occupancy_metric(self, influxdb_write_api):
        """Test storing zone occupancy metric."""
        influxdb_write_api.write.return_value = None

        metric = {
            "measurement": "zone_occupancy",
            "tags": {"zone": "dining"},
            "fields": {"current": 35, "capacity": 50, "percentage": 70.0},
            "time": datetime.utcnow()
        }

        influxdb_write_api.write(bucket="analytics", org="restaurant", record=metric)
        influxdb_write_api.write.assert_called_once()
