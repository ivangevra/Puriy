import { API_BASE, IS_LOCAL_DEMO, request, setAuthToken } from './api';
import { readLocal, writeLocal } from './mobility';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'passenger';
  provider: string;
};

const SESSION_KEY = 'puriy-session';
export const authAvailable = !IS_LOCAL_DEMO;

export const readStoredToken = () => readLocal<string | null>(SESSION_KEY, null);

export function applyStoredToken() {
  setAuthToken(readStoredToken() || '');
}

export function saveSession(token: string | null) {
  setAuthToken(token || '');
  if (token) writeLocal(SESSION_KEY, token);
  else localStorage.removeItem(SESSION_KEY);
}

export const googleStartUrl = (returnUrl: string) =>
  `${API_BASE}/api/auth/google/start?return_url=${encodeURIComponent(returnUrl)}`;

export const authConfig = () => request<{ google: boolean }>('/auth/config');

export const registerAccount = (email: string, password: string, name: string) =>
  request<{ token: string; user: AuthUser }>('/auth/register', {
    email,
    password,
    name,
  });

export const loginAccount = (email: string, password: string) =>
  request<{ token: string; user: AuthUser }>('/auth/login', { email, password });

export const logoutAccount = () => request<{ ok: boolean }>('/auth/logout', {});

export const fetchMe = () => request<{ user: AuthUser | null }>('/auth/me');

export const exchangeLoginCode = (code: string) =>
  request<{ token: string; user: AuthUser }>('/auth/exchange', { code });

export const fetchFavorites = () => request<{ ids: string[] }>('/auth/favorites');

export const saveFavorites = (ids: string[]) =>
  request<{ ids: string[] }>('/auth/favorites', { ids }, 'PUT');
