"""Backend tests covering the acceptance-critical behaviours.

Run:  .venv\\Scripts\\python -m pytest tests -v
"""
import threading

import pytest
from fastapi.testclient import TestClient

from backend.database import SessionLocal, drop_db, init_db
from backend.errors import ConflictError, UnprocessableError
from backend.main import app
from backend.models.db_models import Resource
from backend.schemas.pydantic_schemas import PatientCreate
from backend.services import allocation_service, matching_service, patient_service


@pytest.fixture(autouse=True)
def fresh_db():
    drop_db()
    init_db()
    yield
    drop_db()


def make_resource(name: str, rtype: str = "bed", status: str = "available") -> int:
    db = SessionLocal()
    try:
        resource = Resource(type=rtype, name=name, status=status)
        db.add(resource)
        db.commit()
        db.refresh(resource)
        return resource.id
    finally:
        db.close()


def make_patient(name: str, rtype: str = "bed", urgency: int = 3):
    db = SessionLocal()
    try:
        patient = patient_service.create_patient(
            db, PatientCreate(name=name, resource_type_needed=rtype, urgency_score=urgency)
        )
        return patient.id
    finally:
        db.close()


# --------------------------------------------------------------- health / seed


def test_health_and_seed_reset():
    from seed import seed

    summary = seed()
    assert summary["resources"] == {"bed": 20, "theatre": 5, "staff": 10}
    assert summary["patients"] == {"waiting": 7, "admitted": 4, "discharged": 3}

    client = TestClient(app)
    assert client.get("/health").json()["status"] == "ok"
    assert len(client.get("/resources").json()) == 35
    assert len(client.get("/patients/waiting").json()) == 7


# --------------------------------------------------------------- matching order


def test_matching_prefers_urgency_then_wait_time():
    make_resource("Theatre T1", "theatre")
    # lower urgency but longer wait
    make_patient("Low Urgency Long Wait", "theatre", urgency=2)
    # highest urgency, shorter wait -> must win
    make_patient("High Urgency", "theatre", urgency=9)

    db = SessionLocal()
    try:
        recs = matching_service.get_recommendations(db)
    finally:
        db.close()

    assert len(recs) == 1
    assert recs[0]["patient_name"] == "High Urgency"
    labels = [r["label"] for r in recs[0]["reasons"]]
    assert "Theatre compatible" in labels
    assert "Highest urgency" in labels
    assert "Resource available" in labels


def test_matching_tie_break_is_waiting_time():
    make_resource("Ward B1", "bed")
    db = SessionLocal()
    try:
        from datetime import timedelta

        from backend.models.db_models import Patient, utcnow

        older = Patient(
            name="Older",
            status="waiting",
            resource_type_needed="bed",
            urgency_score=4,
            waiting_since=utcnow() - timedelta(minutes=60),
        )
        newer = Patient(
            name="Newer",
            status="waiting",
            resource_type_needed="bed",
            urgency_score=4,
            waiting_since=utcnow() - timedelta(minutes=5),
        )
        db.add_all([older, newer])
        db.commit()
        recs = matching_service.get_recommendations(db)
    finally:
        db.close()
    assert recs[0]["patient_name"] == "Older"


# --------------------------------------------------------------- safe allocation


def test_concurrent_allocation_only_one_succeeds():
    """AC-5: two simultaneous attempts, at most one wins."""
    resource_id = make_resource("ICU B999")
    patient_id = make_patient("Race Patient", "bed", urgency=5)

    results = {}
    barrier = threading.Barrier(2)

    def worker(idx):
        db = SessionLocal()
        try:
            barrier.wait()  # maximise overlap
            allocation_service.allocate(db, resource_id, patient_id)
            results[idx] = "success"
        except ConflictError:
            results[idx] = "conflict"
        finally:
            db.close()

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results.values()) == ["conflict", "success"]


def test_allocate_without_eligible_patient_returns_422():
    resource_id = make_resource("Ward B7", "bed")
    db = SessionLocal()
    try:
        with pytest.raises(UnprocessableError):
            allocation_service.allocate(db, resource_id)
    finally:
        db.close()


def test_allocate_then_double_allocate_is_rejected():
    resource_id = make_resource("ICU B1")
    make_patient("First", "bed", urgency=5)
    db = SessionLocal()
    try:
        allocation_service.allocate(db, resource_id)
    finally:
        db.close()
    make_patient("Second", "bed", urgency=9)
    db = SessionLocal()
    try:
        with pytest.raises(ConflictError):
            allocation_service.allocate(db, resource_id)
    finally:
        db.close()


# --------------------------------------------------------------- release / discharge


def test_release_returns_resource_and_logs_event():
    resource_id = make_resource("Theatre T7", "theatre")
    patient_id = make_patient("Theatre Patient", "theatre", urgency=5)
    db = SessionLocal()
    try:
        allocation_service.allocate(db, resource_id)
        resource = allocation_service.release(db, resource_id)
        assert resource.status == "available"
        history = patient_service.get_history(db, patient_id)
        types = [e.event_type for e in history]
        assert "resource_released" in types
        assert "patient_waiting" in types  # returned to queue
    finally:
        db.close()


def test_discharge_releases_resource_and_logs_event():
    resource_id = make_resource("Ward B2", "bed")
    patient_id = make_patient("Discharge Me", "bed", urgency=5)
    db = SessionLocal()
    try:
        allocation_service.allocate(db, resource_id)
        patient = patient_service.discharge(db, patient_id)
        assert patient.status == "discharged"
        resource = allocation_service.resource_repo.get_resource(db, resource_id)
        assert resource.status == "available"
        types = [e.event_type for e in patient_service.get_history(db, patient_id)]
        assert "patient_admitted" in types
        assert "patient_discharged" in types
        assert "resource_released" in types
    finally:
        db.close()


# --------------------------------------------------------------- API surface


def test_events_are_read_only():
    client = TestClient(app)
    methods = {
        (route.path, method)
        for route in app.routes
        if hasattr(route, "methods")
        for method in route.methods
    }
    # no mutation verbs exist for the audit trail
    assert ("/events/recent", "POST") not in methods
    assert all(not (path.startswith("/events") and m in {"PUT", "DELETE", "PATCH"}) for path, m in methods)
    assert client.get("/events/recent").status_code == 200


def test_allocate_endpoint_returns_409_for_second_caller():
    client = TestClient(app)
    resource_id = make_resource("ICU B42")
    make_patient("A", "bed", urgency=5)
    make_patient("B", "bed", urgency=4)
    db = SessionLocal()
    try:
        patient_b = patient_service.list_waiting(db)[-1]
        b_id = patient_b.id
    finally:
        db.close()

    first = client.post(f"/resources/{resource_id}/allocate", json={})
    assert first.status_code == 200, first.text
    second = client.post(
        f"/resources/{resource_id}/allocate", json={"patient_id": b_id}
    )
    assert second.status_code == 409
    assert "committed" in second.json()["detail"].lower()
