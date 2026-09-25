import { IS_LOCAL_DEMO, request } from './api';
import { freshLab, validateLab } from './lab-data';
import { LAB_KEY, type LabState } from './lab-types';

export async function loadLab(): Promise<LabState> {
  if (!IS_LOCAL_DEMO) return validateLab(await request('/admin/lab/state'));
  const raw = localStorage.getItem(LAB_KEY);
  return raw ? validateLab(JSON.parse(raw)) : freshLab();
}
export async function saveLab(
  next: LabState,
  revision: number,
): Promise<LabState> {
  validateLab(next);
  if (!IS_LOCAL_DEMO)
    return validateLab(
      await request('/admin/lab/state', { ...next, revision }),
    );
  const current = localStorage.getItem(LAB_KEY);
  if (current && validateLab(JSON.parse(current)).revision !== revision)
    throw new Error(
      'Otro panel cambió el laboratorio. Exporta tus cambios y recarga antes de guardar.',
    );
  const saved = { ...next, revision: revision + 1 };
  const serialized = JSON.stringify(saved);
  if (serialized.length > 1_900_000)
    throw new Error(
      'El laboratorio supera el tamaño de guardado. Exporta y archiva estudios o reduce las conexiones peatonales.',
    );
  // Only announce a successful save after the browser has actually persisted it.
  localStorage.setItem(LAB_KEY, serialized);
  return saved;
}
