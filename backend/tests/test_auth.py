import os
import uuid
from urllib.parse import parse_qs, urlparse

import pytest


def email() -> str:
    return f'prueba-{uuid.uuid4().hex[:10]}@puriy.test'


def register(client, address: str, password: str = 'clave-segura-123', name: str = 'Pasajero'):
    return client.post(
        '/api/auth/register',
        json={'email': address, 'password': password, 'name': name},
    )


def auth(token: str) -> dict:
    return {'Authorization': f'Bearer {token}'}


def test_registro_ingreso_sesion_y_cierre(client):
    address = email()
    response = register(client, address)
    assert response.status_code == 200
    body = response.json()
    assert body['user']['email'] == address
    assert body['user']['role'] == 'passenger'
    token = body['token']

    assert client.get('/api/auth/me').json()['user'] is None
    me = client.get('/api/auth/me', headers=auth(token)).json()
    assert me['user']['email'] == address
    assert 'password_hash' not in me['user']

    assert register(client, address).status_code == 409
    assert register(client, 'sin-arroba', 'clave-segura-123').status_code == 422
    assert register(client, email(), 'corta').status_code == 422

    bad = client.post('/api/auth/login', json={'email': address, 'password': 'incorrecta-123'})
    assert bad.status_code == 401
    good = client.post('/api/auth/login', json={'email': address, 'password': 'clave-segura-123'})
    assert good.status_code == 200

    assert client.post('/api/auth/logout', headers=auth(token)).status_code == 200
    assert client.get('/api/auth/me', headers=auth(token)).json()['user'] is None


def test_favoritos_por_cuenta(client):
    token = register(client, email()).json()['token']
    assert client.get('/api/auth/favorites').status_code == 401
    assert client.get('/api/auth/favorites', headers=auth(token)).json()['ids'] == []
    saved = client.put(
        '/api/auth/favorites',
        headers=auth(token),
        json={'ids': ['D01', 'D01', 'N40']},
    )
    assert saved.status_code == 200
    assert saved.json()['ids'] == ['D01', 'N40']
    assert client.get('/api/auth/favorites', headers=auth(token)).json()['ids'] == ['D01', 'N40']


def test_solo_google_verificado_del_correo_administrador_accede(client):
    from backend import auth as accounts

    address = accounts.ADMIN_EMAIL
    password_token = register(client, address).json()['token']
    assert client.get('/api/admin/status', headers=auth(password_token)).status_code == 403

    password_login = client.post(
        '/api/auth/login', json={'email': address, 'password': 'clave-segura-123'}
    ).json()
    assert password_login['user']['role'] == 'passenger'

    user = accounts.find_user(address)
    user['google_sub'] = 'verified-google-sub'
    accounts._save_user(user)
    google_token = accounts.issue_session(user, method='google')
    assert client.get('/api/auth/me', headers=auth(google_token)).json()['user']['role'] == 'admin'
    assert client.get('/api/admin/status', headers=auth(google_token)).status_code == 200
    assert client.get('/api/admin/status', headers=auth(password_token)).status_code == 403

    other = accounts.create_user(email(), 'Otra cuenta', provider='google', google_sub='other-sub')
    other_token = accounts.issue_session(other, method='google')
    assert client.get('/api/admin/status', headers=auth(other_token)).status_code == 403


def test_permiso_manual_solo_para_la_cuenta_existente(client):
    from backend import auth as accounts

    user = accounts.find_user(accounts.ADMIN_EMAIL)
    if not user:
        user = accounts.create_user(accounts.ADMIN_EMAIL, 'Ivan', password='clave-segura-123')
    user['admin_grant'] = True
    accounts._save_user(user)
    token = accounts.issue_session(user, method='password')
    assert client.get('/api/auth/me', headers=auth(token)).json()['user']['role'] == 'admin'
    assert client.get('/api/admin/status', headers=auth(token)).status_code == 200

    other = accounts.create_user(email(), 'Otra cuenta', password='clave-segura-123')
    other['admin_grant'] = True
    accounts._save_user(other)
    other_token = accounts.issue_session(other, method='password')
    assert client.get('/api/admin/status', headers=auth(other_token)).status_code == 403

    user.pop('admin_grant')
    accounts._save_user(user)
    assert client.get('/api/admin/status', headers=auth(token)).status_code == 403


def test_google_sin_configuracion_y_exchange_invalido(client, monkeypatch):
    monkeypatch.delenv('GOOGLE_CLIENT_ID', raising=False)
    monkeypatch.delenv('GOOGLE_CLIENT_SECRET', raising=False)
    assert client.get('/api/auth/config').json()['google'] is False
    start = client.get('/api/auth/google/start', params={'return_url': 'http://localhost:5173'})
    assert start.status_code == 503
    assert client.post('/api/auth/exchange', json={'code': 'codigo-invalido-largo'}).status_code == 401

    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'cliente-de-prueba')
    monkeypatch.setenv('GOOGLE_CLIENT_SECRET', 'secreto-de-prueba')
    assert client.get('/api/auth/config').json()['google'] is True
    redirect = client.get(
        '/api/auth/google/start',
        params={'return_url': 'http://localhost:5173'},
        follow_redirects=False,
    )
    assert redirect.status_code == 307
    assert redirect.headers['location'].startswith('https://accounts.google.com/o/oauth2/v2/auth?')
    assert client.get(
        '/api/auth/google/start',
        params={'return_url': 'https://sitio-malicioso.example'},
        follow_redirects=False,
    ).status_code == 400


def test_google_verificado_activa_solo_la_sesion_administradora(client, monkeypatch):
    from backend import auth as accounts
    linked_sub = (accounts.find_user(accounts.ADMIN_EMAIL) or {}).get('google_sub') or 'admin-google-id'

    class GoogleResponse:
        status_code = 200

        def __init__(self, body):
            self.body = body

        def json(self):
            return self.body

    class GoogleClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, *args, **kwargs):
            return GoogleResponse({'access_token': 'google-access'})

        async def get(self, *args, **kwargs):
            return GoogleResponse({
                'email': accounts.ADMIN_EMAIL,
                'email_verified': True,
                'sub': linked_sub,
                'name': 'Administrador',
            })

    monkeypatch.setenv('GOOGLE_CLIENT_ID', 'client-test')
    monkeypatch.setenv('GOOGLE_CLIENT_SECRET', 'secret-test')
    monkeypatch.setattr(accounts.httpx, 'AsyncClient', GoogleClient)

    start = client.get(
        '/api/auth/google/start',
        params={'return_url': 'http://localhost:5173'},
        follow_redirects=False,
    )
    state = parse_qs(urlparse(start.headers['location']).query)['state'][0]
    callback = client.get(
        '/api/auth/google/callback',
        params={'code': 'google-code', 'state': state},
        follow_redirects=False,
    )
    assert callback.status_code == 307
    code = parse_qs(urlparse(callback.headers['location']).query)['login_code'][0]
    exchange = client.post('/api/auth/exchange', json={'code': code}).json()
    assert exchange['user']['role'] == 'admin'
    assert client.get('/api/admin/status', headers=auth(exchange['token'])).status_code == 200
    assert client.post('/api/auth/exchange', json={'code': code}).status_code == 401
    assert client.post('/api/auth/login', json={
        'email': accounts.ADMIN_EMAIL,
        'password': 'clave-segura-123',
    }).status_code == 401
