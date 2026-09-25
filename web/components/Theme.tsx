'use client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

type Preference = 'light' | 'dark' | 'system';
type Theme = 'light' | 'dark';
const ThemeContext = createContext<{
  theme: Theme;
  preference: Preference;
  setPreference: (value: Preference) => void;
}>({ theme: 'light', preference: 'system', setPreference: () => {} });
export function ThemeProvider({
  children,
  defaultPreference = 'system',
  storageKey = 'juliaca-theme',
}: {
  children: ReactNode;
  defaultPreference?: Preference;
  storageKey?: string;
}) {
  const [preference, updatePreference] = useState<Preference>(defaultPreference),
    [theme, setTheme] = useState<Theme>(defaultPreference === 'dark' ? 'dark' : 'light'),
    [initialized, setInitialized] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'light' || saved === 'dark') updatePreference(saved);
    } catch {}
    setInitialized(true);
  }, [storageKey]);
  useEffect(() => {
    if (!initialized) return;
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const next =
        preference === 'system'
          ? media.matches
            ? 'dark'
            : 'light'
          : preference;
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference, initialized]);
  const setPreference = (value: Preference) => {
    updatePreference(value);
    try {
      localStorage.setItem(storageKey, value);
    } catch {}
  };
  return (
    <ThemeContext.Provider value={{ theme, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
export const useTheme = () => useContext(ThemeContext);
export function ThemeControl() {
  const { preference, setPreference } = useTheme();
  return (
    <div className="theme-control" role="group" aria-label="Apariencia">
      {(
        [
          ['light', 'Tema claro', Sun],
          ['dark', 'Tema oscuro', Moon],
          ['system', 'Tema del sistema', Monitor],
        ] as const
      ).map(([value, label, Icon]) => (
        <button
          key={value}
          aria-label={label}
          title={label}
          aria-pressed={preference === value}
          onClick={() => setPreference(value)}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}
