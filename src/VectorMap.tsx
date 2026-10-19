import { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
maplibregl.setWorkerUrl(workerUrl);
maplibregl.setWorkerCount(2);
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Place } from './domain';
import { category } from './domain';
export default function VectorMap({
  places,
  selected,
  onSelect,
  onPick,
  onFail,
}: {
  places: Place[];
  selected?: Place | null;
  onSelect: (p: Place) => void;
  onPick?: (lat: number, lng: number) => void;
  onFail: () => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<maplibregl.Map | null>(null);
  const select = useRef(onSelect),
    pick = useRef(onPick),
    fail = useRef(onFail);
  select.current = onSelect;
  pick.current = onPick;
  fail.current = onFail;
  useEffect(() => {
    if (!host.current) return;
    let active = true;
    let m: maplibregl.Map;
    try {
      m = new maplibregl.Map({
        container: host.current,
        style: '/map-ru.json',
        center: [12, 28],
        zoom: 1.8,
        attributionControl: false,
        renderWorldCopies: false,
        maxZoom: 18,
        locale: {
          'NavigationControl.ZoomIn': 'Приблизить',
          'NavigationControl.ZoomOut': 'Отдалить',
          'AttributionControl.ToggleAttribution': 'Источники карты',
        },
      });
    } catch {
      fail.current();
      return;
    }
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    m.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://openfreemap.org/">OpenFreeMap</a> · OpenMapTiles',
      }),
    );
    // Once loaded, isolated resource failures do not discard a working map.
    let loaded = false;
    const timer = setTimeout(() => {
      if (active && !loaded) fail.current();
    }, 12000);
    m.on('load', () => {
      loaded = true;
      host.current?.setAttribute('aria-busy', 'false');
      clearTimeout(timer);
    });
    m.on('error', () => {
      if (active && !loaded) fail.current();
    });
    m.on('click', (e) => {
      const lng = ((((e.lngLat.lng + 180) % 360) + 360) % 360) - 180;
      pick.current?.(e.lngLat.lat, lng);
    });
    const contextLost = () => {
      if (active) fail.current();
    };
    m.getCanvas().addEventListener('webglcontextlost', contextLost, { once: true });
    const observer = new ResizeObserver(() => m.resize());
    observer.observe(host.current);
    return () => {
      active = false;
      m.getCanvas().removeEventListener('webglcontextlost', contextLost);
      clearTimeout(timer);
      observer.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const markers = places.map((p) => {
      const el = document.createElement('button');
      el.className = 'map-dot' + (selected?.id === p.id ? ' selected' : '');
      el.textContent = category(p.primary_category)[2];
      el.title = p.name;
      el.setAttribute('aria-label', p.name);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        select.current(p);
      });
      return new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m);
    });
    return () => markers.forEach((marker) => marker.remove());
  }, [places, selected?.id]);
  useEffect(() => {
    if (selected)
      map.current?.flyTo({
        center: [selected.lng, selected.lat],
        zoom: Math.max(map.current.getZoom(), 6),
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 850,
      });
  }, [selected]);
  return (
    <div className="map-world">
      <div
        className="vector-map-host"
        ref={host}
        role="region"
        aria-busy="true"
        aria-label="Карта с русскими названиями"
      />
      {onPick && <div className="map-notice">Нажмите на карту, чтобы выбрать координаты</div>}
    </div>
  );
}
