import data from './geography.json';
export type GeographicLabel = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: string;
  zoom: number;
  rank: number;
};
export const geographicLabels: GeographicLabel[] = data.sort(
  (a, b) =>
    a.zoom - b.zoom || (a.kind === b.kind ? a.rank - b.rank : a.kind === 'country' ? -1 : 1),
);
export type LabelPosition = { label: GeographicLabel; x: number; y: number };
// Shared screen-space layout: labels never overlap, and saved-place markers get priority.
export function layoutLabels(
  zoom: number,
  width: number,
  height: number,
  project: (label: GeographicLabel) => { x: number; y: number } | null,
  reserved: { x: number; y: number }[] = [],
): LabelPosition[] {
  const boxes = reserved.map((p) => ({ x: p.x - 24, y: p.y - 24, w: 48, h: 48 }));
  const result: LabelPosition[] = [];
  const candidates =
    zoom >= 4
      ? [...geographicLabels].sort((a, b) =>
          a.kind === b.kind ? a.zoom - b.zoom || a.rank - b.rank : a.kind === 'city' ? -1 : 1,
        )
      : geographicLabels;
  for (const label of candidates) {
    if (label.zoom > zoom + (label.kind === 'country' ? 0.7 : 0)) continue;
    const p = project(label);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const w = Math.max(36, Array.from(label.name).length * 7 + 14);
    const box = { x: p.x - w / 2, y: p.y - 11, w, h: 22 };
    if (box.x < 5 || box.y < 5 || box.x + w > width - 5 || box.y + 22 > height - 5) continue;
    if (
      boxes.some(
        (b) =>
          box.x < b.x + b.w + 7 &&
          box.x + w + 7 > b.x &&
          box.y < b.y + b.h + 5 &&
          box.y + box.h + 5 > b.y,
      )
    )
      continue;
    boxes.push(box);
    result.push({ label, x: p.x, y: p.y });
    if (result.length >= 65) break;
  }
  return result;
}
export function drawLabels(layer: HTMLElement, positions: LabelPosition[], night = false) {
  const nodes = new Map(
    [...layer.children].map((n) => [(n as HTMLElement).dataset.id, n as HTMLElement]),
  );
  for (const { label, x, y } of positions) {
    const node = nodes.get(label.id) ?? document.createElement('span');
    nodes.delete(label.id);
    node.dataset.id = label.id;
    node.className = `geo-label ${label.kind}${night ? ' night' : ''}`;
    node.textContent = label.name;
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    if (!node.parentElement) layer.append(node);
  }
  for (const node of nodes.values()) node.remove();
}
export function facesCamera(
  label: { lat: number; lng: number },
  pov: { lat: number; lng: number; altitude: number },
) {
  const rad = Math.PI / 180;
  const dot =
    Math.sin(label.lat * rad) * Math.sin(pov.lat * rad) +
    Math.cos(label.lat * rad) * Math.cos(pov.lat * rad) * Math.cos((label.lng - pov.lng) * rad);
  return dot > 1 / (1 + pov.altitude) + 0.06;
}
