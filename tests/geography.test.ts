import { describe, it, expect } from 'vitest';
import { geographicLabels, facesCamera, layoutLabels } from '../src/geography';
describe('geographic labels', () => {
  it('has finite local coordinates and Russian country and city names', () => {
    expect(geographicLabels.find((l) => l.name === 'Франция')?.kind).toBe('country');
    expect(geographicLabels.find((l) => l.name === 'Париж')?.kind).toBe('city');
    expect(
      geographicLabels.every(
        (l) =>
          Number.isFinite(l.lat) &&
          Math.abs(l.lat) <= 90 &&
          Number.isFinite(l.lng) &&
          Math.abs(l.lng) <= 180,
      ),
    ).toBe(true);
  });
  it('hides the far side and the limb of the globe', () => {
    const pov = { lat: 0, lng: 0, altitude: 2 };
    expect(facesCamera({ lat: 0, lng: 0 }, pov)).toBe(true);
    expect(facesCamera({ lat: 0, lng: 180 }, pov)).toBe(false);
    expect(facesCamera({ lat: 0, lng: 85 }, pov)).toBe(false);
  });
  it('resolves collisions and reserves space for saved-place markers', () => {
    expect(layoutLabels(10, 400, 400, () => ({ x: 200, y: 200 }))).toHaveLength(1);
    expect(
      layoutLabels(10, 400, 400, () => ({ x: 200, y: 200 }), [{ x: 200, y: 200 }]),
    ).toHaveLength(0);
    expect(layoutLabels(10, 400, 400, () => ({ x: 0, y: 0 }))).toHaveLength(0);
  });
});
