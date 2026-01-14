"""Authentication router with JWT tokens."""

import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from slowapi import Limiter
from slowapi.util import get_remote_address

# Rate limiter for auth endpoints (10 requests/minute)
limiter = Limiter(key_func=get_remote_address)
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db
from models import User

# Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "restaurant-analytics-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))  # 8 hours default

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# Pydantic models
class UserResponse(BaseModel):
    """User response model."""
    id: int
    username: str
    email: Optional[str]
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class Token(BaseModel):
    """Token response."""
    access_token: str
    token_type: str
    expires_in: int
    user: UserResponse


class TokenData(BaseModel):
    """Token payload data."""
    username: Optional[str] = None
    role: Optional[str] = None


class UserCreate(BaseModel):
    """User creation model."""
    username: str
    email: Optional[str] = None
    password: str
    role: str = "viewer"


class UserUpdate(BaseModel):
    """User update model."""
    email: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class PasswordChange(BaseModel):
    """Password change model."""
    current_password: str
    new_password: str


# Helper functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_user_by_username(db: Session, username: str) -> Optional[User]:
    """Get user by username."""
    return db.query(User).filter(User.username == username).first()


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email."""
    return db.query(User).filter(User.email == email).first()


def get_user_by_username_or_email(db: Session, identifier: str) -> Optional[User]:
    """Get user by username or email."""
    # First try username
    user = db.query(User).filter(User.username == identifier).first()
    if user:
        return user
    # Then try email
    return db.query(User).filter(User.email == identifier).first()


def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """Authenticate a user by username/email and password."""
    # Allow login with either username or email
    user = get_user_by_username_or_email(db, username)
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user


async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Get current user from JWT token. Returns None if no token or invalid."""
    if not token:
        return None

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            return None
        token_data = TokenData(username=username, role=payload.get("role"))
    except JWTError:
        return None

    user = get_user_by_username(db, token_data.username)
    if user is None or not user.is_active:
        return None
    return user


async def require_auth(
    current_user: Optional[User] = Depends(get_current_user)
) -> User:
    """Require authentication. Raises 401 if not authenticated."""
    if not current_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return current_user


async def require_admin(
    current_user: User = Depends(require_auth)
) -> User:
    """Require admin role."""
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def require_manager_or_admin(
    current_user: User = Depends(require_auth)
) -> User:
    """Require manager or admin role."""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manager or admin access required"
        )
    return current_user


# Endpoints
@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """Login and get access token."""
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Update last login
    user.last_login = datetime.utcnow()
    db.commit()

    # Create token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username, "role": user.role},
        expires_delta=access_token_expires
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            role=user.role,
            is_active=user.is_active,
            created_at=user.created_at,
            last_login=user.last_login
        )
    )


@router.post("/register", response_model=UserResponse, status_code=201)
@limiter.limit("10/minute")
async def register(
    request: Request,
    user_data: UserCreate,
    db: Session = Depends(get_db)
):
    """Register a new user. First user becomes admin."""
    # Check if username exists
    if get_user_by_username(db, user_data.username):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )

    # Check if this is the first user
    user_count = db.query(User).count()
    role = "admin" if user_count == 0 else user_data.role

    # Create user
    user = User(
        username=user_data.username,
        email=user_data.email,
        hashed_password=get_password_hash(user_data.password),
        role=role
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(require_auth)):
    """Get current user info."""
    return current_user


@router.put("/me", response_model=UserResponse)
async def update_current_user(
    update: UserUpdate,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Update current user info (limited fields)."""
    if update.email is not None:
        current_user.email = update.email

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/me/password")
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(require_auth),
    db: Session = Depends(get_db)
):
    """Change current user's password."""
    if not verify_password(password_data.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    current_user.hashed_password = get_password_hash(password_data.new_password)
    db.commit()

    return {"success": True, "message": "Password changed successfully"}


@router.post("/refresh", response_model=Token)
async def refresh_token(current_user: User = Depends(require_auth)):
    """Refresh access token."""
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": current_user.username, "role": current_user.role},
        expires_delta=access_token_expires
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=UserResponse(
            id=current_user.id,
            username=current_user.username,
            email=current_user.email,
            role=current_user.role,
            is_active=current_user.is_active,
            created_at=current_user.created_at,
            last_login=current_user.last_login
        )
    )


# Admin endpoints
@router.get("/users", response_model=list[UserResponse])
async def list_users(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """List all users (admin only)."""
    return db.query(User).order_by(User.created_at.desc()).all()


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: int,
    update: UserUpdate,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update a user (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if update.email is not None:
        user.email = update.email
    if update.role is not None:
        user.role = update.role
    if update.is_active is not None:
        user.is_active = update.is_active

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete a user (admin only)."""
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.delete(user)
    db.commit()

    return {"success": True, "message": f"User {user_id} deleted"}


@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    new_password: str,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Reset a user's password (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = get_password_hash(new_password)
    db.commit()

    return {"success": True, "message": f"Password reset for user {user_id}"}


# Check endpoint (for frontend to verify token without full user data)
@router.get("/check")
async def check_auth(current_user: Optional[User] = Depends(get_current_user)):
    """Check if current token is valid."""
    if current_user:
        return {
            "authenticated": True,
            "username": current_user.username,
            "role": current_user.role
        }
    return {"authenticated": False}
