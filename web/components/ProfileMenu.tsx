'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, LogIn, LogOut, ShieldCheck } from 'lucide-react';
import type { AuthUser } from '../lib/auth';

type Props = {
  user: AuthUser | null;
  favoritesCount: number;
  onLogin: () => void;
  onFavorites: () => void;
  onAdmin: () => void;
  onSignOut: () => Promise<void>;
};

export default function ProfileMenu({
  user,
  favoritesCount,
  onLogin,
  onFavorites,
  onAdmin,
  onSignOut,
}: Props) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDialogElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback((returnFocus = false) => {
    if (!open) return;
    setOpen(false);
    setClosing(true);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    const duration = Number.parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue(
        '--dropdown-close-dur',
      ),
    );
    closeTimer.current = setTimeout(
      () => setClosing(false),
      Number.isFinite(duration) ? duration : 150,
    );
    if (returnFocus) triggerRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !triggerRef.current?.contains(target)
      )
        close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  const initials = (user?.name || user?.email || '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <div className="account-control">
      <button
        ref={triggerRef}
        type="button"
        className="account-trigger"
        aria-label={user ? 'Abrir mi perfil' : 'Iniciar sesión'}
        aria-haspopup={user ? 'dialog' : undefined}
        aria-expanded={user ? open : undefined}
        aria-controls={user ? 'profile-menu' : undefined}
        title={user ? 'Mi perfil' : 'Iniciar sesión'}
        onClick={() => {
          if (!user) {
            onLogin();
            return;
          }
          if (open) close();
          else {
            if (closeTimer.current) clearTimeout(closeTimer.current);
            setClosing(false);
            setOpen(true);
          }
        }}
      >
        {user ? <span aria-hidden="true">{initials || 'U'}</span> : <LogIn size={20} />}
      </button>
      {user && (
        <dialog
          open
          ref={menuRef}
          id="profile-menu"
          aria-label="Mi perfil"
          aria-hidden={!open}
          inert={!open}
          className={`account-menu t-dropdown ${open ? 'is-open' : closing ? 'is-closing' : ''}`}
          data-origin="bottom-left"
        >
          <div className="account-menu-heading">
            <span className="account-menu-avatar" aria-hidden="true">
              {initials || 'U'}
            </span>
            <div>
              <strong>{user.name || 'Mi cuenta'}</strong>
              <span>{user.role === 'admin' ? 'Administrador' : 'Pasajero'}</span>
            </div>
          </div>
          <div className="account-menu-details">
            <span>Correo</span>
            <strong title={user.email}>{user.email}</strong>
            <span>Acceso</span>
            <strong>{user.provider === 'google' ? 'Google' : 'Correo y contraseña'}</strong>
          </div>
          <div className="account-menu-actions">
            <button
              type="button"
              onClick={() => {
                close();
                onFavorites();
              }}
            >
              <Heart size={17} />
              <span>Rutas guardadas</span>
              <small>{favoritesCount}</small>
            </button>
            {user.role === 'admin' && (
              <button
                type="button"
                onClick={() => {
                  close();
                  onAdmin();
                }}
              >
                <ShieldCheck size={17} />
                <span>Administración</span>
              </button>
            )}
            <button
              type="button"
              className="account-signout"
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                try {
                  await onSignOut();
                  close();
                } finally {
                  setSigningOut(false);
                }
              }}
            >
              <LogOut size={17} />
              <span>{signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</span>
            </button>
          </div>
        </dialog>
      )}
      <span className="sr-only">{user ? `Sesión de ${user.name || user.email}` : 'Cuenta'}</span>
    </div>
  );
}
