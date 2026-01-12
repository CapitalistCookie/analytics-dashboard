"""Tests for authentication endpoints."""

import pytest
from datetime import datetime


class TestLogin:
    """Test login functionality."""

    def test_login_success(self, client, admin_user):
        """Test successful login."""
        response = client.post(
            "/api/auth/login",
            data={"username": "testadmin", "password": "testpassword123"}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["username"] == "testadmin"
        assert data["user"]["role"] == "admin"

    def test_login_wrong_password(self, client, admin_user):
        """Test login with wrong password."""
        response = client.post(
            "/api/auth/login",
            data={"username": "testadmin", "password": "wrongpassword"}
        )
        assert response.status_code == 401
        assert "Incorrect username or password" in response.json()["detail"]

    def test_login_nonexistent_user(self, client):
        """Test login with non-existent user."""
        response = client.post(
            "/api/auth/login",
            data={"username": "nonexistent", "password": "password123"}
        )
        assert response.status_code == 401

    def test_login_with_email(self, client, admin_user):
        """Test login using email instead of username."""
        response = client.post(
            "/api/auth/login",
            data={"username": "admin@test.com", "password": "testpassword123"}
        )
        assert response.status_code == 200
        assert response.json()["user"]["username"] == "testadmin"


class TestRegister:
    """Test registration functionality."""

    def test_register_first_user_becomes_admin(self, client):
        """Test that first registered user becomes admin."""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "firstuser",
                "email": "first@test.com",
                "password": "password123"
            }
        )
        assert response.status_code == 201
        assert response.json()["role"] == "admin"

    def test_register_subsequent_user_is_viewer(self, client, admin_user):
        """Test that subsequent users get viewer role by default."""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "seconduser",
                "email": "second@test.com",
                "password": "password123"
            }
        )
        assert response.status_code == 201
        assert response.json()["role"] == "viewer"

    def test_register_duplicate_username(self, client, admin_user):
        """Test registration with duplicate username."""
        response = client.post(
            "/api/auth/register",
            json={
                "username": "testadmin",
                "email": "other@test.com",
                "password": "password123"
            }
        )
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"]


class TestGetCurrentUser:
    """Test get current user functionality."""

    def test_get_me_authenticated(self, client, auth_headers, admin_user):
        """Test getting current user when authenticated."""
        response = client.get("/api/auth/me", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testadmin"
        assert data["role"] == "admin"

    def test_get_me_unauthenticated(self, client):
        """Test getting current user without authentication."""
        response = client.get("/api/auth/me")
        assert response.status_code == 401


class TestChangePassword:
    """Test password change functionality."""

    def test_change_password_success(self, client, auth_headers):
        """Test successful password change."""
        response = client.post(
            "/api/auth/me/password",
            json={
                "current_password": "testpassword123",
                "new_password": "newpassword456"
            },
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_change_password_wrong_current(self, client, auth_headers):
        """Test password change with wrong current password."""
        response = client.post(
            "/api/auth/me/password",
            json={
                "current_password": "wrongpassword",
                "new_password": "newpassword456"
            },
            headers=auth_headers
        )
        assert response.status_code == 400


class TestTokenRefresh:
    """Test token refresh functionality."""

    def test_refresh_token(self, client, auth_headers, admin_user):
        """Test token refresh."""
        response = client.post("/api/auth/refresh", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["username"] == "testadmin"


class TestAuthCheck:
    """Test auth check endpoint."""

    def test_check_authenticated(self, client, auth_headers):
        """Test auth check when authenticated."""
        response = client.get("/api/auth/check", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["authenticated"] is True
        assert data["username"] == "testadmin"

    def test_check_unauthenticated(self, client):
        """Test auth check when not authenticated."""
        response = client.get("/api/auth/check")
        assert response.status_code == 200
        assert response.json()["authenticated"] is False


class TestAdminUserManagement:
    """Test admin user management endpoints."""

    def test_list_users_admin(self, client, auth_headers, admin_user, viewer_user):
        """Test listing users as admin."""
        response = client.get("/api/auth/users", headers=auth_headers)
        assert response.status_code == 200
        users = response.json()
        assert len(users) >= 2
        usernames = [u["username"] for u in users]
        assert "testadmin" in usernames
        assert "testviewer" in usernames

    def test_list_users_non_admin(self, client, viewer_headers):
        """Test listing users as non-admin."""
        response = client.get("/api/auth/users", headers=viewer_headers)
        assert response.status_code == 403

    def test_update_user_admin(self, client, auth_headers, viewer_user):
        """Test updating a user as admin."""
        response = client.put(
            f"/api/auth/users/{viewer_user.id}",
            json={"role": "manager"},
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["role"] == "manager"

    def test_delete_user_admin(self, client, auth_headers, db, viewer_user):
        """Test deleting a user as admin."""
        response = client.delete(
            f"/api/auth/users/{viewer_user.id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["success"] is True

    def test_delete_self_fails(self, client, auth_headers, admin_user):
        """Test that admin cannot delete themselves."""
        response = client.delete(
            f"/api/auth/users/{admin_user.id}",
            headers=auth_headers
        )
        assert response.status_code == 400
        assert "Cannot delete your own account" in response.json()["detail"]

    def test_reset_user_password(self, client, auth_headers, viewer_user):
        """Test resetting a user's password as admin."""
        response = client.post(
            f"/api/auth/users/{viewer_user.id}/reset-password?new_password=newpass123",
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["success"] is True
