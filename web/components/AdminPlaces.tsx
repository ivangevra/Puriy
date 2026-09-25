'use client';
import { useMemo, useState } from 'react';
import { Download, Info, Search } from 'lucide-react';
import { downloadJSON } from '../lib/api';
import { normalizePlace } from '../lib/places';
import {
  CATEGORIES,
  CATEGORY_ORDER,
  DESTINATIONS,
  DESTINATIONS_DATE,
  DESTINATIONS_SOURCE,
  countByCategory,
  destinationsGeoJSON,
  type DestinationCategory,
} from '../lib/destinations';
import { glyphSvg } from '../lib/place-icons';

const COUNTS = countByCategory();

export default function AdminPlaces() {
  const [category, setCategory] = useState<DestinationCategory | 'all'>('all'),
    [query, setQuery] = useState(''),
    [pduOnly, setPduOnly] = useState(false);
  const rows = useMemo(() => {
    const words = normalizePlace(query).split(/\s+/).filter(Boolean);
    return DESTINATIONS.filter(
      (d) =>
        (category === 'all' || d.category === category) &&
        (!pduOnly || d.pdu) &&
        words.every((w) => normalizePlace(d.name).includes(w)),
    );
  }, [category, query, pduOnly]);
  const csv = () => {
    const lines = [
      'id,nombre,categoria,lat,lon,citado_pdu',
      ...rows.map((d) =>
        [d.id, `"${d.name.replace(/"/g, '""')}"`, d.category, d.lat, d.lon, d.pdu ? 'si' : 'no'].join(','),
      ),
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'juliaca-lugares.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="workspace admin-places">
      <p className="muted">
        Destinos que generan viajes: {DESTINATIONS.length} lugares con nombre. Se muestran en el
        mapa de pasajeros (botón «Lugares») y en el buscador de destinos sin conexión.
      </p>
      <div className="admin-chips" role="group" aria-label="Filtrar por categoría">
        <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>
          Todos <small>{DESTINATIONS.length}</small>
        </button>
        {CATEGORY_ORDER.map((c) => (
          <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>
            <i className="place-glyph" style={{ background: CATEGORIES[c].color }} dangerouslySetInnerHTML={{ __html: glyphSvg(c, 11, '#fff') }} />
            {CATEGORIES[c].label} <small>{COUNTS[c]}</small>
          </button>
        ))}
      </div>
      <div className="admin-toolbar">
        <label className="admin-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre"
            aria-label="Buscar lugar"
          />
        </label>
        <label className="admin-check">
          <input type="checkbox" checked={pduOnly} onChange={(e) => setPduOnly(e.target.checked)} />
          Solo citados en el PDU
        </label>
        <span className="admin-toolbar-spacer" />
        <button type="button" className="secondary" onClick={csv}>
          <Download size={15} />
          CSV
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() =>
            downloadJSON('juliaca-lugares.geojson', {
              ...destinationsGeoJSON(CATEGORY_ORDER),
              features: destinationsGeoJSON(CATEGORY_ORDER).features.filter((f) =>
                rows.some((r) => r.id === f.properties.id),
              ),
            })
          }
        >
          <Download size={15} />
          GeoJSON
        </button>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Lugar</th>
              <th>Categoría</th>
              <th>PDU</th>
              <th>Coordenadas</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 200).map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>
                  <span className="place-tag">
                    <i className="place-glyph" style={{ background: CATEGORIES[d.category].color }} dangerouslySetInnerHTML={{ __html: glyphSvg(d.category, 11, '#fff') }} />
                    {CATEGORIES[d.category].one}
                  </span>
                </td>
                <td>{d.pdu ? 'Citado' : '—'}</td>
                <td>
                  <a
                    href={`https://www.openstreetmap.org/?mlat=${d.lat}&mlon=${d.lon}#map=18/${d.lat}/${d.lon}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {d.lat.toFixed(5)}, {d.lon.toFixed(5)}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 200 && (
        <p className="small-note">Se muestran 200 de {rows.length}. Filtra o exporta para ver todos.</p>
      )}
      <div className="analysis-note">
        <Info size={18} />
        <div>
          <strong>Fuente y límites</strong>
          {DESTINATIONS_SOURCE} (descarga {DESTINATIONS_DATE}). OpenStreetMap es colaborativo: puede
          faltar un colegio o tener la entrada mal ubicada. Para el piloto, verifica la puerta de
          acceso y el horario de los destinos del corredor. Actualiza con{' '}
          <code>python scripts/build-places.py</code>.
        </div>
      </div>
    </div>
  );
}
