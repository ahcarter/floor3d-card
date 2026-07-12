import type { HassLike, ThermalConfig, ThermalRoomValue, ThermalSnapshot } from './types';

const fahrenheitToCelsius = (value: number): number => (value - 32) * 5 / 9;
export class ThermalLiveAdapter {
  private signature = '';
  constructor(private config: ThermalConfig) {}
  relevantSignature(hass: HassLike): string {
    return Object.values(this.config.rooms).map(room => {
      const state = room.entity ? hass.states[room.entity] : undefined;
      return room.entity + ':' + (state?.state || '') + ':' + (state?.last_updated || '');
    }).join('|');
  }
  read(hass: HassLike, now = Date.now()): ThermalSnapshot | null {
    const signature = this.relevantSignature(hass);
    if (signature === this.signature) return null;
    this.signature = signature;
    const rooms: Record<string, ThermalRoomValue> = {};
    Object.entries(this.config.rooms).forEach(([id, config]) => {
      const state = config.entity ? hass.states[config.entity] : undefined;
      let temperature = state ? Number(state.state) : NaN;
      const unit = String(state?.attributes?.unit_of_measurement || '°C').toUpperCase();
      if (Number.isFinite(temperature) && unit.includes('F')) temperature = fahrenheitToCelsius(temperature);
      const updated = state?.last_updated ? Date.parse(state.last_updated) : NaN;
      const stale = Number.isFinite(updated) && now - updated > (this.config.stale_after_seconds || 900) * 1000;
      rooms[id] = { temperature: Number.isFinite(temperature) ? temperature : null,
        source: !state || !Number.isFinite(temperature) ? 'missing' : (stale ? 'inferred' : 'measured') };
    });
    return { mode: 'live', timestamp: new Date(now).toISOString(), rooms, flows: {} };
  }
  reset(): void { this.signature = ''; }
}
