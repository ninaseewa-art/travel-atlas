import { Component, Suspense, lazy, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Mesh, MeshPhongMaterial } from 'three';
import type { GlobeMethods } from 'react-globe.gl';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { category } from './domain';
import type { Place } from './domain';
const Globe = lazy(() => import('react-globe.gl'));
function webgl() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
export function clusterPlaces(places: Place[], altitude: number) {
  const size = altitude > 1.8 ? 12 : altitude > 0.8 ? 4 : 0;
  const grouped = new Map<string, Place[]>();
  for (const p of places) {
    const k = size
      ? `${Math.floor((p.lat + 90) / size)},${Math.floor((p.lng + 180) / size)}`
      : p.id;
    const g = grouped.get(k) ?? [];
    g.push(p);
    grouped.set(k, g);
  }
  return [...grouped.values()].map((ps) => ({
    lat: ps.reduce((s, p) => s + p.lat, 0) / ps.length,
    lng: ps.reduce((s, p) => s + p.lng, 0) / ps.length,
    places: ps,
  }));
}
class Guard extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
export function Map2D({
  places,
  selected,
  onSelect,
  onPick,
}: {
  places: Place[];
  selected?: Place | null;
  onSelect: (p: Place) => void;
  onPick?: (lat: number, lng: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    markers = useRef<L.LayerGroup | null>(null);
  const selectRef = useRef(onSelect),
    pickRef = useRef(onPick);
  selectRef.current = onSelect;
  pickRef.current = onPick;
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const m = L.map(host.current, { zoomControl: false, worldCopyJump: true }).setView([28, 12], 2);
    map.current = m;
    // A vector layer in overlayPane stays above raster tiles even after bringToBack().
    const basePane = m.createPane('atlas-base');
    basePane.style.zIndex = '150';
    basePane.style.pointerEvents = 'none';
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    markers.current = L.layerGroup().addTo(m);
    const controller = new AbortController();
    fetch('/land.geojson', { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (!controller.signal.aborted)
          L.geoJSON(data, {
            pane: 'atlas-base',
            style: { color: '#a8bcb0', weight: 0.5, fillColor: '#eef1e7', fillOpacity: 1 },
            interactive: false,
          })
            .addTo(m)
            .bringToBack();
      })
      .catch(() => {});
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    let failures = 0;
    tiles.on('tileerror', () => {
      if (++failures >= 3) {
        m.removeLayer(tiles);
        setOffline(true);
      }
    });
    tiles.addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => {
      let lng = ((((e.latlng.lng + 180) % 360) + 360) % 360) - 180;
      lng = Math.round(lng * 1e6) / 1e6;
      pickRef.current?.(Math.max(-90, Math.min(90, e.latlng.lat)), lng);
    });
    const observer = new ResizeObserver(() => m.invalidateSize());
    observer.observe(host.current);
    return () => {
      controller.abort();
      observer.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    markers.current?.clearLayers();
    for (const p of places) {
      const el = document.createElement('span');
      el.textContent = category(p.primary_category)[2];
      el.className = `map-dot ${p.id === selected?.id ? 'selected' : ''}`;
      const icon = L.divIcon({
        html: el,
        className: 'marker-wrap',
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      const marker = L.marker([p.lat, p.lng], { icon, alt: p.name, keyboard: true }).addTo(
        markers.current!,
      );
      const tooltip = document.createElement('span');
      tooltip.textContent = p.name;
      marker.bindTooltip(tooltip);
      marker.on('click', () => selectRef.current(p));
    }
  }, [places, selected]);
  useEffect(() => {
    if (selected)
      map.current?.flyTo([selected.lat, selected.lng], Math.max(map.current.getZoom(), 6), {
        animate: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      });
  }, [selected]);
  return (
    <div className="map-world">
      <div ref={host} className="leaflet-host" aria-label="Двумерная карта мест" />
      {offline && (
        <div className="map-notice">Тайлы недоступны · базовая карта и точки работают</div>
      )}
      {onPick && <div className="map-notice">Нажмите на карту, чтобы выбрать координаты</div>}
    </div>
  );
}
function GlobeView({
  places,
  selected,
  onSelect,
  rotate,
  onFail,
}: {
  places: Place[];
  selected: Place | null;
  onSelect: (p: Place) => void;
  rotate: boolean;
  onFail: () => void;
}) {
  const ref = useRef<GlobeMethods | undefined>(undefined),
    host = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 700 });
  const [alt, setAlt] = useState(2.2);
  const [ready, setReady] = useState(false);
  const [idle, setIdle] = useState(true);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    const texture = new Image();
    texture.onerror = onFail;
    texture.src = '/textures/earth-night.jpg';
    return () => {
      texture.onerror = null;
    };
  }, [onFail]);
  useEffect(() => {
    const o = new ResizeObserver(([e]) =>
      setSize({ width: e.contentRect.width, height: e.contentRect.height }),
    );
    if (host.current) o.observe(host.current);
    return () => {
      o.disconnect();
      clearTimeout(idleTimer.current);
    };
  }, []);
  useEffect(() => {
    if (ready && ref.current) {
      const c = ref.current.controls();
      c.autoRotate = rotate && idle && !reduced;
      c.autoRotateSpeed = 0.32;
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      c.minDistance = 115;
      c.maxDistance = 650;
    }
  }, [rotate, ready, reduced, idle]);
  useEffect(() => {
    if (ready && selected)
      ref.current?.pointOfView(
        { lat: selected.lat, lng: selected.lng, altitude: 1.15 },
        reduced ? 0 : 1100,
      );
  }, [selected, ready, reduced]);
  const data = clusterPlaces(places, alt);
  const interact = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), 10000);
  };
  return (
    <div
      ref={host}
      className="globe-host"
      onPointerDown={interact}
      onWheel={interact}
      onKeyDown={(e) => {
        const pov = ref.current?.pointOfView();
        if (!pov) return;
        interact();
        const targets: Record<string, object> = {
          ArrowLeft: { lng: pov.lng - 12 },
          ArrowRight: { lng: pov.lng + 12 },
          ArrowUp: { lat: Math.min(85, pov.lat + 12) },
          ArrowDown: { lat: Math.max(-85, pov.lat - 12) },
          '+': { altitude: Math.max(0.2, pov.altitude - 0.3) },
          '-': { altitude: Math.min(4, pov.altitude + 0.3) },
        };
        if (targets[e.key]) {
          e.preventDefault();
          ref.current?.pointOfView({ ...pov, ...targets[e.key] }, 200);
        }
      }}
      tabIndex={0}
      role="region"
      aria-label="3D-глобус. Стрелки — вращение, плюс и минус — масштаб. Места также доступны в списке."
    >
      <Suspense fallback={<div className="world-loading">Приближаемся к Земле…</div>}>
        <Globe
          ref={ref}
          width={size.width}
          height={size.height}
          backgroundColor="rgba(0,0,0,0)"
          globeImageUrl="/textures/earth-night.jpg"
          showAtmosphere
          atmosphereColor="#68b4ef"
          atmosphereAltitude={0.16}
          animateIn={!reduced}
          htmlElementsData={data}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.025}
          htmlElement={(obj) => {
            const d = obj as (typeof data)[number];
            const b = document.createElement('button');
            b.className = 'globe-pin';
            b.textContent =
              d.places.length > 1
                ? String(d.places.length)
                : category(d.places[0].primary_category)[2];
            b.setAttribute(
              'aria-label',
              d.places.length > 1 ? `${d.places.length} мест. Приблизить` : d.places[0].name,
            );
            b.title = d.places.map((p) => p.name).join(', ');
            b.onclick = () => {
              interact();
              if (d.places.length > 1)
                ref.current?.pointOfView(
                  { lat: d.lat, lng: d.lng, altitude: alt > 1.8 ? 1.1 : 0.5 },
                  reduced ? 0 : 700,
                );
              else onSelect(d.places[0]);
            };
            return b;
          }}
          onZoom={(p) => setAlt(p.altitude)}
          onGlobeReady={() => {
            ref.current?.scene().traverse((object) => {
              const material = (object as Mesh).material as MeshPhongMaterial | undefined;
              if (material?.isMeshPhongMaterial && material.map) {
                // The surface texture also emits light, so cities stay lit while rotating.
                material.emissive.set('#ffffff');
                material.emissiveMap = material.map;
                material.emissiveIntensity = 1.4;
                material.shininess = 0;
                material.needsUpdate = true;
              }
            });
            setReady(true);
            ref.current?.pointOfView({ lat: 28, lng: 22, altitude: 2.2 }, 0);
            const canvas = ref.current?.renderer().domElement;
            canvas?.addEventListener('webglcontextlost', onFail, { once: true });
          }}
        />
      </Suspense>
    </div>
  );
}
export default function World(props: {
  places: Place[];
  selected: Place | null;
  onSelect: (p: Place) => void;
  mode: '3d' | '2d';
  rotate: boolean;
}) {
  const [supported, setSupported] = useState(webgl);
  const fallback = <Map2D {...props} />;
  return props.mode === '2d' || !supported ? (
    fallback
  ) : (
    <Guard fallback={fallback}>
      <GlobeView {...props} onFail={() => setSupported(false)} />
    </Guard>
  );
}
