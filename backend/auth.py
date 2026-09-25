"""Cuentas de pasajero y administración: correo con contraseña y Google.

Las sesiones son tokens aleatorios; solo se guarda su hash. Las contraseñas usan
scrypt con sal por usuario. No se registran correos ni tokens en los logs.
"""
import hashlib
import hmac
import os
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from . import storage

router = APIRouter(prefix='/api/auth', tags=['auth'])

EMAIL = re.compile(r'^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,24}$')
SESSION_DAYS = 30
GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
GOOGLE_USERINFO = 'https://www.googleapis.com/oauth2/v3/userinfo'
_attempts: dict[str, list[float]] = {}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _expired(value: str) -> bool:
    try:
        return datetime.fromisoformat(value) < _now()
    except (TypeError, ValueError):
        return True


def allowed_origins() -> list[str]:
    raw = os.getenv(
        'CORS_ORIGINS', 'http://localhost:5173,http://127.0.0.1:5173'
    )
    return [o.strip().rstrip('/') for o in raw.split(',') if o.strip()]


ADMIN_EMAIL = 'ivangvera201@gmail.com'


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32
    )
    return f'scrypt$16384$8$1${salt.hex()}${digest.hex()}'


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt, digest = stored.split('$')
        if scheme != 'scrypt':
            return False
        expected = hashlib.scrypt(
            password.encode(),
            salt=bytes.fromhex(salt),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(bytes.fromhex(digest)),
        )
        return hmac.compare_digest(expected, bytes.fromhex(digest))
    except (ValueError, TypeError):
        return False


_DUMMY_HASH = hash_password('puriy-relleno-para-igualar-tiempos')


def _user_key(email: str) -> str:
    return f'user:{email}'

def _session_key(token: str) -> str:
    return 'session:' + hashlib.sha256(token.encode()).hexdigest()


def find_user(email: str) -> dict | None:
    return storage.get(_user_key(email.lower()))


def public_user(user: dict) -> dict:
    return {
        'id': user['id'],
        'email': user['email'],
        'name': user['name'],
        'role': user.get('role', 'passenger'),
        'provider': user.get('provider', 'password'),
    }


def _role_for(user: dict, method: str) -> str:
    return (
        'admin'
        if user.get('email', '').lower() == ADMIN_EMAIL
        and (
            user.get('admin_grant') is True
            or (method == 'google' and user.get('google_sub'))
        )
        else 'passenger'
    )


def _save_user(user: dict) -> dict:
    # Manual grants belong to an existing account record. A fresh registration
    # with the same address never inherits the grant.
    user['role'] = (
        'admin'
        if user.get('email', '').lower() == ADMIN_EMAIL
        and user.get('admin_grant') is True
        else 'passenger'
    )
    storage.save(_user_key(user['email']), 'users', user)
    return user


def create_user(
    email: str,
    name: str,
    password: str | None = None,
    provider: str = 'password',
    google_sub: str | None = None,
) -> dict:
    return _save_user(
        {
            'id': 'usr_' + secrets.token_hex(8),
            'email': email.lower(),
            'name': name.strip()[:80] or email.split('@')[0],
            'password_hash': hash_password(password) if password else None,
            'provider': provider,
            'google_sub': google_sub,
            'role': 'passenger',
            'favorites': [],
            'created_at': _now().isoformat(),
        }
    )


def issue_session(user: dict, method: str = 'password') -> str:
    token = secrets.token_urlsafe(32)
    storage.save(
        _session_key(token),
        'sessions',
        {
            'email': user['email'],
            'method': method,
            'expires_at': (_now() + timedelta(days=SESSION_DAYS)).isoformat(),
            'created_at': _now().isoformat(),
        },
    )
    return token


def resolve_session(token: str) -> dict | None:
    if not token:
        return None
    data = storage.get(_session_key(token))
    if not data or _expired(data.get('expires_at', '')):
        return None
    user = find_user(data.get('email', ''))
    if not user:
        return None
    return {**user, 'role': _role_for(user, data.get('method', ''))}


def bearer(authorization: str = Header(default='')) -> str:
    return authorization[7:] if authorization.startswith('Bearer ') else ''


def current_user(authorization: str = Header(default='')) -> dict:
    user = resolve_session(bearer(authorization))
    if not user:
        raise HTTPException(401, 'Inicia sesión para continuar.')
    return user


def _throttle(key: str) -> None:
    now = time.time()
    stamps = [t for t in _attempts.get(key, []) if now - t < 300]
    if len(stamps) >= 8:
        raise HTTPException(429, 'Demasiados intentos. Espera unos minutos.')
    stamps.append(now)
    _attempts[key] = stamps


def _clear_throttle(key: str) -> None:
    _attempts.pop(key, None)


class RegisterPayload(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=8, max_length=200)
    name: str = Field(default='', max_length=80)


class LoginPayload(BaseModel):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=1, max_length=200)


class ExchangePayload(BaseModel):
    code: str = Field(min_length=8, max_length=200)


class FavoritesPayload(BaseModel):
    ids: list[str] = Field(default_factory=list, max_length=200)


def _checked_email(email: str) -> str:
    value = email.strip().lower()
    if not EMAIL.match(value):
        raise HTTPException(422, 'Escribe un correo electrónico válido.')
    return value


@router.get('/config')
def auth_config():
    return {
        'google': bool(
            os.getenv('GOOGLE_CLIENT_ID') and os.getenv('GOOGLE_CLIENT_SECRET')
        )
    }


@router.post('/register')
def register(payload: RegisterPayload):
    email = _checked_email(payload.email)
    if find_user(email):
        raise HTTPException(409, 'Ya existe una cuenta con ese correo.')
    user = create_user(email, payload.name, password=payload.password)
    token = issue_session(user)
    return {'token': token, 'user': public_user(resolve_session(token))}


@router.post('/login')
def login(payload: LoginPayload):
    email = _checked_email(payload.email)
    _throttle(f'login:{email}')
    user = find_user(email)
    stored = (user or {}).get('password_hash') or _DUMMY_HASH
    valid = verify_password(payload.password, stored)
    if not user or not user.get('password_hash') or not valid:
        raise HTTPException(401, 'Correo o contraseña incorrectos.')
    _clear_throttle(f'login:{email}')
    user = _save_user(user)
    token = issue_session(user)
    return {'token': token, 'user': public_user(resolve_session(token))}


@router.post('/logout')
def logout(authorization: str = Header(default='')):
    token = bearer(authorization)
    if token:
        storage.delete(_session_key(token))
    return {'ok': True}


@router.get('/me')
def me(authorization: str = Header(default='')):
    user = resolve_session(bearer(authorization))
    return {'user': public_user(user) if user else None}


@router.get('/favorites')
def get_favorites(authorization: str = Header(default='')):
    account = resolve_session(bearer(authorization))
    if not account:
        raise HTTPException(401, 'Inicia sesión para continuar.')
    return {'ids': account.get('favorites', [])}


@router.put('/favorites')
def put_favorites(payload: FavoritesPayload, authorization: str = Header(default='')):
    account = resolve_session(bearer(authorization))
    if not account:
        raise HTTPException(401, 'Inicia sesión para continuar.')
    clean = [i for i in dict.fromkeys(payload.ids) if isinstance(i, str) and len(i) <= 80]
    account['favorites'] = clean[:200]
    storage.save(_user_key(account['email']), 'users', account)
    return {'ids': account['favorites']}


def _callback_url(request: Request) -> str:
    base = os.getenv('PUBLIC_API_URL', '').rstrip('/') or str(request.base_url).rstrip('/')
    return f'{base}/api/auth/google/callback'


def _safe_return(value: str) -> str:
    if not value:
        return ''
    for origin in allowed_origins():
        if value == origin or value.startswith(origin + '/'):
            return value.rstrip('/')
    return ''


@router.get('/google/start')
def google_start(request: Request, return_url: str = ''):
    client_id = os.getenv('GOOGLE_CLIENT_ID', '')
    if not client_id or not os.getenv('GOOGLE_CLIENT_SECRET'):
        raise HTTPException(
            503, 'El acceso con Google no está configurado en el servidor.'
        )
    target = _safe_return(return_url) or _safe_return(
        request.headers.get('referer', '')
    )
    if not target:
        raise HTTPException(400, 'Origen no permitido para el acceso con Google.')
    state = secrets.token_urlsafe(24)
    storage.save(
        f'oauth:{state}',
        'oauth_states',
        {
            'return_url': target,
            'expires_at': (_now() + timedelta(minutes=10)).isoformat(),
        },
    )
    query = urlencode(
        {
            'client_id': client_id,
            'redirect_uri': _callback_url(request),
            'response_type': 'code',
            'scope': 'openid email profile',
            'state': state,
            'prompt': 'select_account',
        }
    )
    return RedirectResponse(f'{GOOGLE_AUTH}?{query}')


@router.get('/google/callback')
async def google_callback(request: Request, code: str = '', state: str = ''):
    record = storage.get(f'oauth:{state}') if state else None
    if not record or _expired(record.get('expires_at', '')):
        raise HTTPException(400, 'Solicitud de acceso vencida. Inténtalo otra vez.')
    storage.delete(f'oauth:{state}')
    client_id = os.getenv('GOOGLE_CLIENT_ID', '')
    client_secret = os.getenv('GOOGLE_CLIENT_SECRET', '')
    if not code or not client_id or not client_secret:
        raise HTTPException(503, 'El acceso con Google no está configurado.')
    async with httpx.AsyncClient(timeout=15) as client:
        token_response = await client.post(
            GOOGLE_TOKEN,
            data={
                'code': code,
                'client_id': client_id,
                'client_secret': client_secret,
                'redirect_uri': _callback_url(request),
                'grant_type': 'authorization_code',
            },
        )
        if token_response.status_code != 200:
            raise HTTPException(401, 'No se pudo verificar la cuenta de Google.')
        access_token = token_response.json().get('access_token')
        info_response = await client.get(
            GOOGLE_USERINFO, headers={'Authorization': f'Bearer {access_token}'}
        )
        if info_response.status_code != 200:
            raise HTTPException(401, 'No se pudo leer el perfil de Google.')
        info = info_response.json()
    email = str(info.get('email', '')).lower()
    if not info.get('email_verified') or not EMAIL.match(email):
        raise HTTPException(401, 'La cuenta de Google no tiene un correo verificado.')
    user = find_user(email)
    if user:
        if user.get('google_sub') and user['google_sub'] != str(info.get('sub', '')):
            raise HTTPException(401, 'Esta cuenta de Google no coincide con la vinculada.')
        if not user.get('google_sub'):
            user['google_sub'] = str(info.get('sub', ''))
        if email == ADMIN_EMAIL:
            # A prior unverified password registration for this address must
            # not remain a second way into the administrator's account.
            user['password_hash'] = None
            user['provider'] = 'google'
        user = _save_user(user)
    else:
        user = create_user(
            email,
            str(info.get('name', '')),
            provider='google',
            google_sub=str(info.get('sub', '')),
        )
    login_code = secrets.token_urlsafe(24)
    storage.save(
        f'login:{login_code}',
        'login_codes',
        {
            'email': user['email'],
            'expires_at': (_now() + timedelta(minutes=2)).isoformat(),
        },
    )
    separator = '&' if '?' in record['return_url'] else '?'
    return RedirectResponse(
        f"{record['return_url']}{separator}login_code={login_code}"
    )


@router.post('/exchange')
def exchange(payload: ExchangePayload):
    record = storage.get(f'login:{payload.code}')
    if not record or _expired(record.get('expires_at', '')):
        raise HTTPException(401, 'El acceso venció. Inténtalo otra vez.')
    storage.delete(f'login:{payload.code}')
    user = find_user(record.get('email', ''))
    if not user:
        raise HTTPException(401, 'No se encontró la cuenta.')
    user = _save_user(user)
    token = issue_session(user, method='google')
    return {'token': token, 'user': public_user(resolve_session(token))}
