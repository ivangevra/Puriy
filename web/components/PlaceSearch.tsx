'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Search, BusFront, Landmark } from 'lucide-react';
import type { Network } from '../lib/mobility';
import {
  localPlaces,
  searchPlaces,
  normalizePlace,
  type Place,
} from '../lib/places';
import {
  POPULAR_DESTINATIONS,
  searchDestinations,
} from '../lib/destinations';
export default function PlaceSearch({
  id,
  label,
  value,
  placeholder,
  network,
  onChange,
  onSelect,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  network: Network;
  onChange: (value: string) => void;
  onSelect: (place: Place) => void;
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [remote, setRemote] = useState<Place[]>([]),
    [status, setStatus] = useState('');
  const local = useMemo(
    () =>
      value.trim()
        ? [...localPlaces(network, value), ...searchDestinations(value, 5)]
        : POPULAR_DESTINATIONS,
    [network, value],
  );
  const container = useRef<HTMLDivElement>(null);
  const items = [
    ...local,
    ...remote.filter(
      (r) =>
        !local.some((l) => normalizePlace(l.name) === normalizePlace(r.name)),
    ),
  ].slice(0, 8);
  useEffect(() => {
    setRemote([]);
    setActive(-1);
    setStatus('');
    if (!open || value.trim().length < 3) return;
    const controller = new AbortController();
    setStatus('Buscando calles y lugares…');
    const timer = setTimeout(() => {
      searchPlaces(value, controller.signal)
        .then((results) => {
          if (controller.signal.aborted) return;
          setRemote(results);
          setStatus(
            results.length
              ? ''
              : 'Sin más coincidencias en Juliaca. Puedes marcar el lugar en el mapa.',
          );
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setStatus(
              'Búsqueda en línea no disponible. Usa los lugares disponibles o el mapa.',
            );
        });
    }, 650);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value, open]);
  const choose = (item: Place) => {
    onSelect(item);
    setOpen(false);
    setActive(-1);
  };
  return (
    <div
      className="place-search"
      ref={container}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={`${id}-suggestions`}
        aria-activedescendant={
          open && active >= 0 ? `${id}-option-${active}` : undefined
        }
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            return;
          }
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            setActive((i) =>
              items.length
                ? (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) %
                  items.length
                : -1,
            );
          }
          if (e.key === 'Enter' && open && active >= 0 && items[active]) {
            e.preventDefault();
            choose(items[active]);
          }
        }}
      />
      {open && (
        <div className="place-suggestions">
          <div className="place-search-heading">
            <Search size={13} />
            <span>
              {value.trim() ? 'Lugares en Juliaca' : 'Lugares concurridos'}
            </span>
          </div>
          <ul
            id={`${id}-suggestions`}
            role="listbox"
            aria-label={`Sugerencias de ${label.toLowerCase()}`}
          >
            {items.map((item, i) => (
              <li
                key={item.id}
                id={`${id}-option-${i}`}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(item)}
              >
                {item.category ? (
                  <Landmark size={18} />
                ) : item.source === 'local' ? (
                  <BusFront size={18} />
                ) : (
                  <MapPin size={18} />
                )}
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.detail}</small>
                </span>
              </li>
            ))}
          </ul>
          <p role="status">
            {status ||
              (!items.length
                ? 'Escribe al menos tres letras o marca el lugar en el mapa.'
                : 'Usa ↑ ↓ y Enter para elegir.')}
          </p>
          {value.trim().length >= 3 && (
            <small className="place-source">
              Búsqueda: Photon / OpenStreetMap · el texto se consulta en línea
            </small>
          )}
        </div>
      )}
    </div>
  );
}
