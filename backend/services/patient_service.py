"""Service layer: patient intake, queue, discharge, history."""
from typing import List, Optional

from sqlalchemy.orm import Session

from backend.errors import ConflictError, NotFoundError
from backend.repositories import event_repository as event_repo
from backend.repositories import patient_repository as patient_repo
from backend.repositories import resource_repository as resource_repo
from backend.schemas.pydantic_schemas import PatientCreate
from backend.services import matching_service


def create_patient(db: Session, data: PatientCreate):
    patient = patient_repo.create_patient(
        db,
        name=data.name.strip(),
        resource_type_needed=data.resource_type_needed,
        urgency_score=data.urgency_score,
    )
    event_repo.add_event(
        db,
        "patient_created",
        patient_id=patient.id,
        note=f"{patient.name} registered needing a {patient.resource_type_needed} "
        f"(urgency {patient.urgency_score}).",
    )
    event_repo.add_event(
        db,
        "patient_waiting",
        patient_id=patient.id,
        note=f"{patient.name} joined the waiting queue.",
    )
    matching_service.record_trigger(db, patient.resource_type_needed)
    db.commit()
    db.refresh(patient)
    return patient


def list_waiting(db: Session):
    return patient_repo.list_waiting(db)


def list_patients(db: Session, status: Optional[str] = None):
    return patient_repo.list_patients(db, status)


def get_patient(db: Session, patient_id: int):
    patient = patient_repo.get_patient(db, patient_id)
    if patient is None:
        raise NotFoundError(f"Patient {patient_id} was not found.")
    return patient


def get_history(db: Session, patient_id: int):
    get_patient(db, patient_id)  # 404 if missing
    return event_repo.list_for_patient(db, patient_id)


def discharge(db: Session, patient_id: int):
    """Discharge a patient, release any linked resource, trigger matching."""
    patient = get_patient(db, patient_id)
    if patient.status == "discharged":
        raise ConflictError(f"{patient.name} is already discharged.")

    resource = None
    if patient.current_resource_id is not None:
        resource = resource_repo.get_resource(db, patient.current_resource_id)

    if resource is not None and resource.status == "committed":
        if resource_repo.try_release(db, resource.id):
            event_repo.add_event(
                db,
                "resource_released",
                patient_id=patient.id,
                resource_id=resource.id,
                note=f"{resource.name} released on discharge of {patient.name}.",
            )

    patient.status = "discharged"
    patient.current_resource_id = None
    event_repo.add_event(
        db,
        "patient_discharged",
        patient_id=patient.id,
        resource_id=resource.id if resource else None,
        note=f"{patient.name} discharged.",
    )
    if resource is not None:
        matching_service.record_trigger(db, resource.type)
    db.commit()
    db.refresh(patient)
    return patient
