import type { ThermalFrame, ThermalRoomValue } from './types';

const clamp = (v: number, min = 0, max = 1): number => Math.min(max, Math.max(min, v));
const rgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const hex = (v: number): string => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');
export function interpolateColor(a: string, b: string, t: number): string {
  const x = rgb(a), y = rgb(b), p = clamp(t);
  return '#' + hex(x[0] + (y[0] - x[0]) * p) + hex(x[1] + (y[1] - x[1]) * p) + hex(x[2] + (y[2] - x[2]) * p);
}
export function temperatureColor(value: ThermalRoomValue, min = 16, max = 28, delta = false): string {
  if (value.temperature === null || !Number.isFinite(value.temperature)) return '#8a8f98';
  if (delta && Number.isFinite(value.setpoint)) {
    const d = clamp((value.temperature! - value.setpoint! + 4) / 8);
    return d < 0.5 ? interpolateColor('#2962ff', '#f5f5f5', d * 2) : interpolateColor('#f5f5f5', '#e53935', (d - 0.5) * 2);
  }
  const p = clamp((value.temperature - min) / Math.max(0.001, max - min));
  return p < 0.5 ? interpolateColor('#2c7bb6', '#ffffbf', p * 2) : interpolateColor('#ffffbf', '#d7191c', (p - 0.5) * 2);
}
export function flowScale(value: number, maxMagnitude: number, range: [number, number] = [0.8, 4]): number {
  const p = clamp(Math.abs(value) / Math.max(maxMagnitude, 0.0001));
  return range[0] + (range[1] - range[0]) * Math.sqrt(p);
}
export function interpolateFrames(a: ThermalFrame, b: ThermalFrame, at: number): ThermalFrame {
  const span = Date.parse(b.timestamp) - Date.parse(a.timestamp);
  const p = clamp(span ? (at - Date.parse(a.timestamp)) / span : 0);
  const rooms: ThermalFrame['rooms'] = {};
  new Set([...Object.keys(a.rooms), ...Object.keys(b.rooms)]).forEach(id => {
    const x = a.rooms[id], y = b.rooms[id];
    if (!x) rooms[id] = y; else if (!y) rooms[id] = x; else {
      const mix = (m?: number, n?: number): number | undefined => Number.isFinite(m) && Number.isFinite(n) ? m! + (n! - m!) * p : (Number.isFinite(m) ? m : n);
      rooms[id] = { temperature: x.temperature === null || y.temperature === null ? (p < .5 ? x.temperature : y.temperature) : x.temperature + (y.temperature - x.temperature) * p,
        source: p < .5 ? x.source : y.source, uncertainty: mix(x.uncertainty, y.uncertainty), setpoint: mix(x.setpoint, y.setpoint) };
    }
  });
  const flows: Record<string, number> = {};
  new Set([...Object.keys(a.flows || {}), ...Object.keys(b.flows || {})]).forEach(id => {
    const x = a.flows?.[id] || 0, y = b.flows?.[id] || 0; flows[id] = x + (y - x) * p;
  });
  return { ...a, timestamp: new Date(at).toISOString(), rooms, flows, hvac_state: p < .5 ? a.hvac_state : b.hvac_state };
}
