import { HassLike, ThermalConfig, ThermalDataset, ThermalLayout, ThermalMode, ThermalSnapshot, ThermalWindow } from './types';
import { ThermalLiveAdapter } from './live-adapter';
import { ThermalPlaybackAdapter } from './playback-adapter';
import { interpolateFrames } from './scales';

export interface ThermalControllerState {
  mode: ThermalMode; window: ThermalWindow; playing: boolean; speed: number;
  cursor: number; loading: boolean; error?: string; snapshot?: ThermalSnapshot;
}
export class ThermalController extends EventTarget {
  state: ThermalControllerState;
  layout?: ThermalLayout;
  private dataset?: ThermalDataset;
  private live: ThermalLiveAdapter;
  private playback?: ThermalPlaybackAdapter;
  private timer?: number;
  private lastHass?: HassLike;
  constructor(public readonly config: ThermalConfig) {
    super();
    const mode = config.mode || 'live', window = config.default_window || '24h';
    this.state = { mode, window, playing: false, speed: 1, cursor: 0, loading: false };
    this.live = new ThermalLiveAdapter(config);
    if (config.manifest_url) this.playback = new ThermalPlaybackAdapter(config.manifest_url);
  }
  private emit(): void { this.dispatchEvent(new Event('change')); }
  updateHass(hass: HassLike): void {
    this.lastHass = hass;
    if (this.state.mode !== 'live') return;
    const snapshot = this.live.read(hass);
    if (snapshot) { this.state = { ...this.state, snapshot, error: undefined }; this.emit(); }
  }
  async setMode(mode: ThermalMode): Promise<void> {
    if (mode === this.state.mode) return;
    this.pause();
    if (mode === 'live') {
      this.state = { ...this.state, mode, cursor: 0, error: undefined };
      this.live.reset(); if (this.lastHass) this.updateHass(this.lastHass); else this.emit();
      return;
    }
    this.state = { ...this.state, mode, loading: true, error: undefined, snapshot: undefined }; this.emit();
    try { await this.loadWindow(this.state.window); }
    catch (e) { this.state = { ...this.state, loading: false, error: e instanceof Error ? e.message : String(e) }; this.emit(); }
  }
  async loadWindow(window: ThermalWindow): Promise<void> {
    if (!this.playback) throw new Error('thermal.manifest_url is required for playback');
    this.pause(); this.state = { ...this.state, mode: 'playback', window, loading: true, error: undefined, snapshot: undefined }; this.emit();
    const result = await this.playback.load(window, this.config.layout_url);
    this.layout = result.layout; this.dataset = result.dataset;
    this.state = { ...this.state, loading: false, cursor: Math.max(0, result.dataset.frames.length - 1) };
    this.updatePlaybackSnapshot(); this.emit();
  }
  seek(cursor: number): void {
    if (!this.dataset?.frames.length) return;
    this.state = { ...this.state, cursor: Math.min(this.dataset.frames.length - 1, Math.max(0, cursor)) };
    this.updatePlaybackSnapshot(); this.emit();
  }
  setSpeed(speed: number): void { this.state = { ...this.state, speed: [1, 4, 12].includes(speed) ? speed : 1 }; this.emit(); }
  play(): void {
    if (this.state.mode !== 'playback' || !this.dataset?.frames.length || this.timer) return;
    this.state = { ...this.state, playing: true }; this.emit();
    this.timer = window.setInterval(() => {
      const next = this.state.cursor + this.state.speed / 2;
      if (!this.dataset || next > this.dataset.frames.length - 1) { this.pause(); return; }
      this.seek(next);
    }, 500);
  }
  pause(): void {
    if (this.timer) window.clearInterval(this.timer); this.timer = undefined;
    if (this.state.playing) { this.state = { ...this.state, playing: false }; this.emit(); }
  }
  togglePlay(): void { this.state.playing ? this.pause() : this.play(); }
  frameCount(): number { return this.dataset?.frames.length || 0; }
  private updatePlaybackSnapshot(): void {
    if (!this.dataset?.frames.length) { this.state = { ...this.state, error: 'Thermal dataset contains no frames', snapshot: undefined }; return; }
    const low = Math.floor(this.state.cursor), high = Math.min(this.dataset.frames.length - 1, Math.ceil(this.state.cursor));
    const a = this.dataset.frames[low], b = this.dataset.frames[high];
    const at = low === high ? Date.parse(a.timestamp) : Date.parse(a.timestamp) + (Date.parse(b.timestamp) - Date.parse(a.timestamp)) * (this.state.cursor - low);
    const frame = low === high ? a : interpolateFrames(a, b, at);
    const flows = { ...(frame.flows || {}) };
    this.layout?.edges.forEach(edge => {
      if (edge.kind !== 'heating' && edge.kind !== 'solar') return;
      const values = edge.kind === 'heating' ? frame.heating_delivery : frame.solar_gain;
      const room = [edge.from, edge.to].find(id => values?.[id] !== undefined);
      if (room) flows[edge.id] = values![room];
    });
    this.state = { ...this.state, snapshot: { mode: 'playback', timestamp: frame.timestamp, rooms: frame.rooms, flows, hvac_state: frame.hvac_state } };
  }
  dispose(): void { this.pause(); }
}
