"""Database connections for SQLite and InfluxDB."""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from influxdb_client import InfluxDBClient
from influxdb_client.client.write_api import SYNCHRONOUS

# SQLite Configuration
SQLITE_DATABASE_URL = os.getenv("SQLITE_DATABASE_URL", "sqlite:///./analytics.db")

engine = create_engine(
    SQLITE_DATABASE_URL,
    connect_args={"check_same_thread": False}  # Needed for SQLite
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Dependency for getting database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# InfluxDB Configuration
INFLUXDB_URL = os.getenv("INFLUXDB_URL", "http://influxdb:8086")
INFLUXDB_TOKEN = os.getenv("INFLUXDB_TOKEN", "analytics-token")
INFLUXDB_ORG = os.getenv("INFLUXDB_ORG", "restaurant")
INFLUXDB_BUCKET = os.getenv("INFLUXDB_BUCKET", "analytics")


class InfluxDBConnection:
    """InfluxDB connection manager."""

    _client: InfluxDBClient | None = None

    @classmethod
    def get_client(cls) -> InfluxDBClient:
        """Get or create InfluxDB client."""
        if cls._client is None:
            cls._client = InfluxDBClient(
                url=INFLUXDB_URL,
                token=INFLUXDB_TOKEN,
                org=INFLUXDB_ORG
            )
        return cls._client

    @classmethod
    def get_write_api(cls):
        """Get write API for synchronous writes."""
        return cls.get_client().write_api(write_options=SYNCHRONOUS)

    @classmethod
    def get_query_api(cls):
        """Get query API for reading data."""
        return cls.get_client().query_api()

    @classmethod
    def close(cls):
        """Close the InfluxDB client."""
        if cls._client:
            cls._client.close()
            cls._client = None

    @classmethod
    def health_check(cls) -> bool:
        """Check if InfluxDB is healthy."""
        try:
            health = cls.get_client().health()
            return health.status == "pass"
        except Exception:
            return False


def init_db():
    """Initialize SQLite database tables."""
    Base.metadata.create_all(bind=engine)
