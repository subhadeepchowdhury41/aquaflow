import os

# Configure in-memory SQLite before importing app modules
os.environ["DATABASE_URL"] = "sqlite:///./test_aquaflow.db"

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient
from app.core.database import Base, get_db
from app.core.config import settings
from app.services.platform_service import PlatformService
from app.main import app

engine = create_engine(
    "sqlite:///./test_aquaflow.db",
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    PlatformService.seed_initial_platform_data(db)
    db.close()
    yield
    Base.metadata.drop_all(bind=engine)
    try:
        if os.path.exists("./test_aquaflow.db"):
            os.remove("./test_aquaflow.db")
    except Exception:
        pass


@pytest.fixture
def db_session():
    session = TestingSessionLocal()
    yield session
    session.close()


@pytest.fixture
def client():
    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
