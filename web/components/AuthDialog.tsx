'use client';
import { useEffect, useRef, useState } from 'react';
import { X, Mail, LockKeyhole, UserRound, Eye, EyeOff } from 'lucide-react';
import LogoMark from './Logo';
import {
  authAvailable,
  googleStartUrl,
  loginAccount,
  registerAccount,
  saveSession,
  type AuthUser,
} from '../lib/auth';

export default function AuthDialog({
  open,
  mode,
  onMode,
  onClose,
  onUser,
  notify,
  google,
}: {
  open: boolean;
  mode: 'login' | 'register';
  onMode: (mode: 'login' | 'register') => void;
  onClose: () => void;
  onUser: (user: AuthUser) => void;
  notify: (text: string) => void;
  google: boolean;
}) {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (emailRef.current || dialogRef.current?.querySelector<HTMLButtonElement>('.auth-close'))?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])');
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  const submit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data =
        mode === 'register'
          ? await registerAccount(email.trim(), password, name.trim())
          : await loginAccount(email.trim(), password);
      saveSession(data.token);
      onUser(data.user);
      notify(
        `Hola, ${data.user.name || data.user.email}. Sesión iniciada.`,
      );
      setPassword('');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-backdrop">
      <dialog
        ref={dialogRef}
        open
        aria-modal="true"
        className="auth-card"
        aria-label={mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}
      >
        <div className="auth-story" aria-hidden="true">
          <div className="auth-story-brand"><LogoMark size={38} /><span>puriy<span className="brand-dot">.</span></span></div>
          <svg className="auth-route-art" viewBox="0 0 260 230" fill="none" aria-hidden="true">
            <path className="auth-route-secondary" d="M24 182H75C97 182 100 165 100 147V96C100 76 115 73 139 73H236" />
            <path className="auth-route-main" d="M24 182H75C97 182 100 165 100 147V96C100 76 115 73 139 73H236" />
            <circle className="auth-route-stop" cx="24" cy="182" r="8" />
            <circle className="auth-route-stop" cx="100" cy="131" r="8" />
            <circle className="auth-route-end" cx="236" cy="73" r="12" />
            <circle className="auth-route-end-inner" cx="236" cy="73" r="4" />
          </svg>
          <div className="auth-story-copy"><strong>Tu ciudad, más cerca.</strong><p>Explora los recorridos de Juliaca y guarda tus rutas para volver a ellas cuando las necesites.</p></div>
        </div>
        <div className="auth-form-panel">
        <button
          className="icon-button auth-close"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <div className="auth-mobile-brand"><LogoMark size={32} /><span>puriy<span className="brand-dot">.</span></span></div>
        <h2>{mode === 'register' ? 'Crea tu cuenta' : 'Bienvenido de nuevo'}</h2>
        <p className="auth-intro">
          {mode === 'register'
            ? 'Guarda tus rutas favoritas y accede a ellas desde cualquier dispositivo.'
            : 'Entra para continuar con tus rutas guardadas.'}
        </p>
        <div className="auth-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'active' : ''}
            onClick={() => {
              onMode('login');
              setError('');
            }}
          >
            Iniciar sesión
          </button>
          <button
            role="tab"
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'active' : ''}
            onClick={() => {
              onMode('register');
              setError('');
            }}
          >
            Crear cuenta
          </button>
        </div>
        {authAvailable ? (
          <>
            <form className="form-stack auth-form" onSubmit={submit}>
              {mode === 'register' && (
                <label>
                  Nombre
                  <span className="auth-input-wrap"><UserRound size={18} />
                  <input
                    maxLength={80}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Cómo te llamamos"
                  />
                  </span>
                </label>
              )}
              <label>
                Correo electrónico
                <span className="auth-input-wrap"><Mail size={18} />
                <input
                  ref={emailRef}
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                />
                </span>
              </label>
              <div className="auth-field">
                <label htmlFor="auth-password">Contraseña</label>
                <span className="auth-input-wrap"><LockKeyhole size={18} />
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={mode === 'register' ? 8 : 1}
                  autoComplete={
                    mode === 'register' ? 'new-password' : 'current-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === 'register' ? 'Al menos 8 caracteres' : 'Tu contraseña'
                  }
                />
                <button type="button" className="auth-password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button></span>
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button className="primary auth-submit" disabled={busy}>
                {busy
                  ? 'Un momento…'
                  : mode === 'register'
                    ? 'Crear cuenta'
                    : 'Entrar'}
              </button>
            </form>
            <div className="auth-separator">
              <span>o continúa con</span>
            </div>
            <button
              className="secondary auth-google"
              disabled={!google || busy}
              onClick={() => { window.location.href = googleStartUrl(location.origin); }}
            >
              <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.23c0-.68-.06-1.36-.18-2.02H12v3.83h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.76 2.99-4.35 2.99-7.33Z"/><path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.44l-3.23-2.5c-.9.6-2.06.96-3.4.96a6 6 0 0 1-5.64-4.16H3.04v2.58A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.36 13.86a6.01 6.01 0 0 1 0-3.72V7.56H3.04a10 10 0 0 0 0 8.88l3.32-2.58Z"/><path fill="#EA4335" d="M12 5.98c1.43 0 2.71.49 3.72 1.45l2.88-2.88A9.59 9.59 0 0 0 12 2a10 10 0 0 0-8.96 5.56l3.32 2.58A6 6 0 0 1 12 5.98Z"/></svg>
              Google
            </button>
            {!google && <p className="auth-availability">Google estará disponible al configurar las credenciales OAuth en el servidor.</p>}
          </>
        ) : (
          <p className="small-note">
            Conecta el servidor para crear cuentas. En este modo de
            demostración los datos quedan solo en tu navegador.
          </p>
        )}
        </div>
      </dialog>
    </div>
  );
}
