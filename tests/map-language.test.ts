import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
const style = JSON.parse(readFileSync('public/map-ru.json', 'utf8'));
describe('Russian map style', () => {
  it('is a valid MapLibre style with no baked-in foreign raster labels', () => {
    expect(validateStyleMin(style)).toEqual([]);
    expect(
      Object.values(style.sources).every((s) => (s as { type: string }).type === 'vector'),
    ).toBe(true);
  });
  it('uses only Russian names on every text layer, without English/local-language fallbacks', () => {
    const layers = style.layers.filter(
      (l: { layout?: Record<string, unknown> }) => l.layout?.['text-field'],
    );
    expect(layers.length).toBeGreaterThan(10);
    for (const layer of layers) {
      expect(layer.layout['text-field']).toEqual(['coalesce', ['get', 'name:ru'], '']);
      expect(layer.layout['text-allow-overlap']).toBe(false);
    }
  });
});
