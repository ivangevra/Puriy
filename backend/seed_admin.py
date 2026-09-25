"""Crea o restablece la cuenta administradora en la base local.

`juliaca.db` no se versiona: tras clonar el repositorio no existe ninguna
cuenta y Administración queda sin acceso. Este script crea la cuenta de
`auth.ADMIN_EMAIL` con su permiso explícito y la contraseña que se le indique.
No toca recorridos publicados, propuestas ni laboratorio.

Uso, desde la raíz del proyecto:

    .\\.venv\\Scripts\\python.exe -m backend.seed_admin
    .\\.venv\\Scripts\\python.exe -m backend.seed_admin "mi clave larga"

Sin argumento pide la contraseña sin mostrarla en pantalla; también se puede
pasar en la variable `ADMIN_SEED_PASSWORD`. La contraseña nunca se imprime.
"""
import getpass
import os
import sys

from . import auth, storage


def main() -> int:
    storage.Base.metadata.create_all(storage.engine)
    password = os.getenv('ADMIN_SEED_PASSWORD') or (
        sys.argv[1] if len(sys.argv) > 1 else ''
    )
    if not password:
        password = getpass.getpass(f'Contraseña para {auth.ADMIN_EMAIL}: ')
    if len(password) < 8:
        print('La contraseña debe tener al menos 8 caracteres.')
        return 1
    user = auth.find_user(auth.ADMIN_EMAIL)
    if not user:
        user = auth.create_user(
            auth.ADMIN_EMAIL, 'Administración Puriy', password=password
        )
    user['password_hash'] = auth.hash_password(password)
    user['admin_grant'] = True
    if not user.get('google_sub'):
        user['provider'] = 'password'
    saved = auth._save_user(user)
    print(
        f'Cuenta administradora lista: {saved["email"]} (rol {saved["role"]}). '
        'Inicia sesión en la web con esa contraseña.'
    )
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
