'use client';
import { useEffect, useState } from 'react';
import { DRAFT_KEY, parseDraft, type RouteDraft } from '../lib/route-drafts';
import { PUBLISHED_KEY, type PublishedRoute } from '../lib/map-workspace';
import { downloadJSON } from '../lib/api';
export default function DraftRecovery({
  publications,
  onOpen,
}: {
  publications: PublishedRoute[];
  onOpen: (d: RouteDraft) => void;
}) {
  const [drafts, setDrafts] = useState<RouteDraft[]>([]),
    [issues, setIssues] = useState<string[]>([]);
  useEffect(() => {
    const valid = new Map<string, RouteDraft>(),
      errors: string[] = [];
    for (const key of [DRAFT_KEY, PUBLISHED_KEY, PUBLISHED_KEY + '-backup'])
      try {
        const raw = JSON.parse(localStorage.getItem(key) || 'null');
        const items =
          key === DRAFT_KEY
            ? raw?.drafts || []
            : (raw || []).map((p: { draft: unknown }) => p.draft);
        for (const item of items)
          try {
            const d = parseDraft(item);
            if (!publications.some((p) => p.draft.id === d.id))
              valid.set(d.id, d);
          } catch (e) {
            errors.push(
              `${item?.code || item?.name || 'Registro'}: ${(e as Error).message}`,
            );
          }
      } catch {
        errors.push(
          'No se pudo leer un archivo local. Descarga el respaldo para recuperarlo.',
        );
      }
    setDrafts([...valid.values()]);
    setIssues(errors);
  }, [publications]);
  return (
    <section className="draft-recovery">
      <div className="section-heading">
        <h2>Borradores guardados</h2>
        <button
          className="secondary"
          onClick={() =>
            downloadJSON('juliaca-respaldo-local.json', {
              origin: location.origin,
              drafts: localStorage.getItem(DRAFT_KEY),
              publications: localStorage.getItem(PUBLISHED_KEY),
              previousPublications: localStorage.getItem(
                PUBLISHED_KEY + '-backup',
              ),
            })
          }
        >
          Descargar respaldo
        </button>
      </div>
      {!drafts.length && !issues.length && (
        <p className="small-note">
          No hay borradores pendientes en esta dirección. Si trabajaste en otro
          puerto o navegador, abre allí la ruta y exporta su Copia JSON.
        </p>
      )}
      {drafts.map((d) => (
        <div className="admin-route-row" key={d.id}>
          <strong>
            {d.code || 'Sin código'} · {d.name || 'Sin nombre'}
          </strong>
          <span>Borrador · no publicado</span>
          <button className="secondary" onClick={() => onOpen(d)}>
            Recuperar en el editor
          </button>
        </div>
      ))}
      {issues.map((issue, i) => (
        <p className="form-error" key={i}>
          {issue} El registro original se conserva en el respaldo.
        </p>
      ))}
    </section>
  );
}
