"""Tests for shift notes endpoints."""

import pytest
from datetime import datetime, timedelta


class TestListNotes:
    """Test shift notes listing functionality."""

    def test_list_notes_empty(self, client):
        """Test listing notes when empty."""
        response = client.get("/api/notes")
        assert response.status_code == 200
        assert response.json() == []

    def test_list_notes_with_data(self, client, sample_shift_note):
        """Test listing notes with data."""
        response = client.get("/api/notes")
        assert response.status_code == 200
        notes = response.json()
        assert len(notes) == 1
        assert notes[0]["content"] == "Test shift note content"

    def test_list_notes_filter_category(self, client, db, admin_user):
        """Test filtering notes by category."""
        from models import ShiftNote

        note = ShiftNote(
            content="Maintenance note",
            category="maintenance",
            created_by=admin_user.id,
            shift_date=datetime.utcnow()
        )
        db.add(note)
        db.commit()

        response = client.get("/api/notes?category=maintenance")
        assert response.status_code == 200
        notes = response.json()
        assert all(n["category"] == "maintenance" for n in notes)

    def test_list_notes_pinned_first(self, client, db, admin_user):
        """Test that pinned notes appear first."""
        from models import ShiftNote

        regular = ShiftNote(
            content="Regular note",
            is_pinned=False,
            created_by=admin_user.id,
            shift_date=datetime.utcnow()
        )
        pinned = ShiftNote(
            content="Pinned note",
            is_pinned=True,
            created_by=admin_user.id,
            shift_date=datetime.utcnow()
        )
        db.add_all([regular, pinned])
        db.commit()

        response = client.get("/api/notes")
        assert response.status_code == 200
        notes = response.json()
        # Pinned notes should be first
        assert notes[0]["is_pinned"] is True


class TestCreateNote:
    """Test note creation functionality."""

    def test_create_note_success(self, client, admin_user):
        """Test successful note creation."""
        response = client.post(
            f"/api/notes?created_by={admin_user.id}",
            json={
                "content": "New shift note",
                "category": "safety"
            }
        )
        assert response.status_code == 201
        data = response.json()
        assert data["content"] == "New shift note"
        assert data["category"] == "safety"
        assert data["is_pinned"] is False

    def test_create_note_pinned(self, client, admin_user):
        """Test creating a pinned note."""
        response = client.post(
            f"/api/notes?created_by={admin_user.id}",
            json={
                "content": "Important note",
                "is_pinned": True
            }
        )
        assert response.status_code == 201
        assert response.json()["is_pinned"] is True

    def test_create_note_default_category(self, client, admin_user):
        """Test note creation with default category."""
        response = client.post(
            f"/api/notes?created_by={admin_user.id}",
            json={"content": "Note content"}
        )
        assert response.status_code == 201
        assert response.json()["category"] == "general"


class TestGetNote:
    """Test get single note functionality."""

    def test_get_note_success(self, client, sample_shift_note):
        """Test getting a note by ID."""
        response = client.get(f"/api/notes/{sample_shift_note.id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == sample_shift_note.id
        assert data["content"] == "Test shift note content"

    def test_get_note_not_found(self, client):
        """Test getting non-existent note."""
        response = client.get("/api/notes/9999")
        assert response.status_code == 404


class TestUpdateNote:
    """Test note update functionality."""

    def test_update_note_success(self, client, sample_shift_note):
        """Test successful note update."""
        response = client.put(
            f"/api/notes/{sample_shift_note.id}",
            json={
                "content": "Updated content",
                "category": "maintenance"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["content"] == "Updated content"
        assert data["category"] == "maintenance"

    def test_update_note_not_found(self, client):
        """Test updating non-existent note."""
        response = client.put(
            "/api/notes/9999",
            json={"content": "Test"}
        )
        assert response.status_code == 404


class TestDeleteNote:
    """Test note deletion functionality."""

    def test_delete_note_success(self, client, sample_shift_note):
        """Test successful note deletion."""
        response = client.delete(f"/api/notes/{sample_shift_note.id}")
        assert response.status_code == 200
        assert response.json()["success"] is True

        # Verify deletion
        response = client.get(f"/api/notes/{sample_shift_note.id}")
        assert response.status_code == 404

    def test_delete_note_not_found(self, client):
        """Test deleting non-existent note."""
        response = client.delete("/api/notes/9999")
        assert response.status_code == 404


class TestPinNote:
    """Test note pinning functionality."""

    def test_pin_note(self, client, sample_shift_note):
        """Test pinning a note."""
        assert sample_shift_note.is_pinned is False

        response = client.post(f"/api/notes/{sample_shift_note.id}/pin")
        assert response.status_code == 200
        assert response.json()["is_pinned"] is True

    def test_unpin_note(self, client, db, admin_user):
        """Test unpinning a note."""
        from models import ShiftNote

        note = ShiftNote(
            content="Pinned note",
            is_pinned=True,
            created_by=admin_user.id,
            shift_date=datetime.utcnow()
        )
        db.add(note)
        db.commit()

        response = client.post(f"/api/notes/{note.id}/pin")
        assert response.status_code == 200
        assert response.json()["is_pinned"] is False

    def test_pin_not_found(self, client):
        """Test pinning non-existent note."""
        response = client.post("/api/notes/9999/pin")
        assert response.status_code == 404


class TestAcknowledgeNote:
    """Test note acknowledgement functionality."""

    def test_acknowledge_note(self, client, sample_shift_note, admin_user):
        """Test acknowledging a note."""
        response = client.post(
            f"/api/notes/{sample_shift_note.id}/acknowledge?acknowledged_by={admin_user.id}"
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_acknowledge_not_found(self, client, admin_user):
        """Test acknowledging non-existent note."""
        response = client.post(
            f"/api/notes/9999/acknowledge?acknowledged_by={admin_user.id}"
        )
        assert response.status_code == 404


class TestAcknowledgeAll:
    """Test bulk acknowledgement functionality."""

    def test_acknowledge_all(self, client, db, admin_user):
        """Test acknowledging all notes."""
        from models import ShiftNote

        for i in range(3):
            note = ShiftNote(
                content=f"Note {i}",
                is_acknowledged=False,
                created_by=admin_user.id,
                shift_date=datetime.utcnow()
            )
            db.add(note)
        db.commit()

        response = client.post(
            f"/api/notes/acknowledge-all?acknowledged_by={admin_user.id}"
        )
        assert response.status_code == 200
        data = response.json()
        assert data["acknowledged_count"] == 3


class TestCurrentShiftNotes:
    """Test current shift notes endpoint."""

    def test_get_current_shift_notes(self, client, sample_shift_note):
        """Test getting current shift notes."""
        response = client.get("/api/notes/current-shift")
        assert response.status_code == 200
        # Should return notes from today
        notes = response.json()
        assert isinstance(notes, list)


class TestUnreadCount:
    """Test unread notes count endpoint."""

    def test_unread_count(self, client, db, admin_user):
        """Test getting unread notes count."""
        from models import ShiftNote

        # Create some unread notes
        for i in range(3):
            note = ShiftNote(
                content=f"Unread {i}",
                is_acknowledged=False,
                created_by=admin_user.id,
                shift_date=datetime.utcnow()
            )
            db.add(note)
        db.commit()

        response = client.get("/api/notes/unread-count")
        assert response.status_code == 200
        assert response.json()["unread_count"] == 3


class TestNoteCategories:
    """Test note categories endpoint."""

    def test_get_categories(self, client):
        """Test getting note categories."""
        response = client.get("/api/notes/categories")
        assert response.status_code == 200
        categories = response.json()["categories"]
        assert "general" in categories
        assert "maintenance" in categories
        assert "safety" in categories


class TestNoteTemplates:
    """Test note templates endpoint."""

    def test_get_templates(self, client, admin_user):
        """Test getting quick templates."""
        # Need to pass db info so it doesn't conflict with other endpoints
        response = client.get("/api/notes/templates")
        assert response.status_code == 200
        data = response.json()
        assert "templates" in data
        assert isinstance(data["templates"], list)


class TestNoteStats:
    """Test note statistics endpoint."""

    def test_get_stats(self, client, sample_shift_note):
        """Test getting note statistics."""
        response = client.get("/api/notes/stats/summary")
        assert response.status_code == 200
        data = response.json()
        assert "total" in data
        assert "unread" in data
        assert "pinned" in data
