import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { GlobeMethods } from 'react-globe.gl';
import { drawLabels, facesCamera, layoutLabels } from './geography';
export default function GlobeLabels({
  globe,
  ready,
  enabled,
  places,
}: {
  globe: RefObject<GlobeMethods | undefined>;
  ready: boolean;
  enabled: boolean;
  places: { lat: number; lng: number }[];
}) {
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ready || !enabled || !layer.current) return;
    let frame = 0,
      last = -Infinity;
    const render = (time: number) => {
      const g = globe.current,
        el = layer.current;
      if (g && el && time - last > 100) {
        last = time;
        const pov = g.pointOfView();
        const project = (p: { lat: number; lng: number }) => {
          if (!facesCamera(p, pov)) return null;
          const point = g.getScreenCoords(p.lat, p.lng, 0.01);
          // Leave the bottom controls and the label toggle unobstructed.
          if (point.y > el.clientHeight - 100 || (point.y < 70 && point.x > el.clientWidth - 120))
            return null;
          return point;
        };
        const reserved = places.map(project).filter((p) => p !== null);
        drawLabels(
          el,
          layoutLabels(
            Math.log2(2.2 / Math.max(0.1, pov.altitude)) + 3,
            el.clientWidth,
            el.clientHeight,
            project,
            reserved,
          ),
          true,
        );
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(frame);
      layer.current?.replaceChildren();
    };
  }, [globe, ready, enabled, places]);
  return enabled ? (
    <div ref={layer} className="geo-label-overlay globe-labels" aria-hidden="true" />
  ) : null;
}
