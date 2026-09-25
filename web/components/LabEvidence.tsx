'use client';
import { useState } from 'react';
import { Download, Search } from 'lucide-react';
import { catalog } from '../lib/lab-data';
import { downloadJSON } from '../lib/api';
import type { CensusData, LabState } from '../lib/lab-types';

export default function LabEvidence({
  census,
  state,
}: {
  census: CensusData | null;
  state: LabState;
}) {
  const [query, setQuery] = useState('');
  const normalize = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const lines = catalog.lines.filter((r) =>
    normalize(`${r.code} ${r.name}`).includes(normalize(query)),
  );
  const districts = [...new Set(census?.blocks.map((b) => b.district) || [])];
  return (
    <div className="lab-evidence">
      <section className="surface">
        <div className="surface-head">
          <div>
            <h2>Qué sabemos y qué falta</h2>
            <p className="muted">
              Cada cifra conserva su procedencia y su límite de uso.
            </p>
          </div>
          <button
            className="secondary"
            onClick={() => downloadJSON('juliaca-catalogo-pdu.json', catalog)}
          >
            <Download size={16} />
            Exportar catálogo
          </button>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <caption>
              Población asociada al Censo 2017 · geometrías actuales
            </caption>
            <thead>
              <tr>
                <th>Distrito</th>
                <th>Manzanas</th>
                <th>Con población</th>
                <th>Sin correspondencia</th>
                <th>Habitantes conocidos</th>
              </tr>
            </thead>
            <tbody>
              {districts.map((d) => {
                const rows = census!.blocks.filter((b) => b.district === d);
                return (
                  <tr key={d}>
                    <th scope="row">{d}</th>
                    <td>{rows.length.toLocaleString('es-PE')}</td>
                    <td>{rows.filter((b) => b.population !== null).length}</td>
                    <td>{rows.filter((b) => b.population === null).length}</td>
                    <td>
                      {rows
                        .reduce((n, b) => n + (b.population ?? 0), 0)
                        .toLocaleString('es-PE')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!census && <output>Cartografía todavía no disponible.</output>}
        <p className="small-note">
          No son totales distritales certificados ni población 2026. Un dato
          ausente no significa manzana deshabitada. La densidad combina
          población 2017 con la superficie de la geometría disponible.
        </p>
        <dl className="lab-readiness">
          <div>
            <dt>Destinos listos para escenarios</dt>
            <dd>
              {
                state.places.filter(
                  (p) =>
                    p.point && p.validation === 'reviewed' && p.open && p.close,
                ).length
              }{' '}
              de {state.places.length}
            </dd>
          </div>
          <div>
            <dt>Afectaciones con ventana y efecto revisados</dt>
            <dd>
              {state.events.filter((e) => e.validation === 'reviewed').length}{' '}
              de {state.events.length}
            </dd>
          </div>
          <div>
            <dt>Observaciones de campo registradas</dt>
            <dd>{state.observations.length}</dd>
          </div>
          <div>
            <dt>Conexiones peatonales importadas</dt>
            <dd>{state.walking?.links.length || 0}</dd>
          </div>
        </dl>
      </section>
      <section className="surface">
        <h2>Flota documental del PDU</h2>
        <p className="muted">
          Tabla 95, páginas 177–178 · documento de consulta pública.
        </p>
        <div className="data-note">
          <span>
            <strong>Conciliación pendiente:</strong> el total impreso es 1.963
            vehículos; las 40 filas suman 1.969 (1.814 combis y 155 microbuses).
            No se usa este padrón como flota activa del escenario.
          </span>
        </div>
        <label className="lab-search">
          <Search size={17} />
          <span className="sr-only">Buscar empresa o código PDU</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar empresa o código PDU"
          />
        </label>
        <div className="table-scroll lab-catalog-table">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Empresa · nombre abreviado</th>
                <th>Combis</th>
                <th>Microbuses</th>
                <th>Fuente</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((r) => (
                <tr key={r.id}>
                  <th scope="row">{r.code}</th>
                  <td>{r.name}</td>
                  <td>{r.combis}</td>
                  <td>{r.microbuses}</td>
                  <td>PDU · pp. {r.page}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!lines.length && (
          <p className="empty-state">
            Ninguna empresa coincide con la búsqueda.
          </p>
        )}
        <p className="small-note">
          El horario urbano aproximado 05:00–22:00 no define salidas por línea.
          Los horarios de terminales de la tabla 103 tampoco son frecuencias de
          micros urbanos.
        </p>
      </section>
      <section className="surface">
        <h2>Evidencias para la propuesta</h2>
        <p className="muted">
          <a href={catalog.url} target="_blank" rel="noreferrer">
            Consulta pública del PDU · Municipalidad Provincial de San Román
          </a>
        </p>
        <div className="lab-claims">
          {catalog.claims.map((c) => (
            <details key={c.id}>
              <summary>
                {c.id} · {c.reference}
              </summary>
              <p>{c.finding}</p>
              <p className="small-note">{c.limit}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
