import { ThermalController } from './controller';
import type { ThermalWindow } from './types';

export class ThermalControls {
  readonly element = document.createElement('section');
  private onChange = (): void => this.render();
  constructor(private controller: ThermalController) {
    this.element.className = 'floor3d-thermal-controls';
    this.element.setAttribute('aria-label', 'Thermal digital twin controls');
    this.element.addEventListener('click', this.click);
    this.element.addEventListener('input', this.input);
    controller.addEventListener('change', this.onChange);
    this.render();
  }
  private click = (event: Event): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'mode') void this.controller.setMode(this.controller.state.mode === 'live' ? 'playback' : 'live');
    if (action === 'play') this.controller.togglePlay();
    if (action === 'speed') this.controller.setSpeed(Number(target.dataset.value));
    if (action === 'window') void this.loadWindow(target.dataset.value as ThermalWindow);
  };
  private input = (event: Event): void => {
    const target = event.target as HTMLInputElement;
    if (target.dataset.action === 'seek') this.controller.seek(Number(target.value));
  };
  private async loadWindow(window: ThermalWindow): Promise<void> {
    try { await this.controller.loadWindow(window); }
    catch (error) {
      this.controller.state = { ...this.controller.state, loading: false, error: error instanceof Error ? error.message : String(error) };
      this.controller.dispatchEvent(new Event('change'));
    }
  }
  render(): void {
    const s = this.controller.state, snapshot = s.snapshot;
    // Mid-drag on the seek slider, a full innerHTML rebuild would replace the
    // input under the pointer and abort the drag; update text in place instead.
    const seek = this.element.querySelector<HTMLInputElement>('input[data-action="seek"]');
    if (seek && document.activeElement === seek && s.mode === 'playback' && !s.loading && !s.error) {
      const output = this.element.querySelector('output');
      if (output && snapshot) output.textContent = new Date(snapshot.timestamp).toLocaleString();
      this.renderValues(snapshot);
      return;
    }
    this.element.innerHTML =
      '<div class="thermal-toolbar">' +
      '<button data-action="mode" aria-pressed="' + (s.mode === 'playback') + '">' + (s.mode === 'live' ? 'Live' : 'Playback') + '</button>' +
      (s.mode === 'playback' ? '<button data-action="play">' + (s.playing ? 'Pause' : 'Play') + '</button>' : '') +
      (s.mode === 'playback' ? ['1','4','12'].map(x => '<button data-action="speed" data-value="' + x + '" aria-pressed="' + (s.speed === Number(x)) + '">' + x + '×</button>').join('') : '') +
      (s.mode === 'playback' ? ['2h','24h','7d'].map(x => '<button data-action="window" data-value="' + x + '" aria-pressed="' + (s.window === x) + '">' + x + '</button>').join('') : '') +
      '</div>' +
      (s.mode === 'playback' ? '<input aria-label="Thermal playback time" data-action="seek" type="range" min="0" max="' + Math.max(0, this.controller.frameCount() - 1) + '" step="0.01" value="' + s.cursor + '">' : '') +
      '<output aria-live="polite">' + (s.loading ? 'Loading thermal history…' : s.error ? 'Thermal error: ' + this.escape(s.error) : snapshot ? new Date(snapshot.timestamp).toLocaleString() : 'Waiting for thermal data') + '</output>' +
      (this.controller.config.visualization?.show_labels === false ? '' : '<div class="thermal-values"></div>') +
      '<div class="thermal-legend"><span>Cool</span><i></i><span>Warm</span><span class="inferred-key">Dashed/inferred</span></div>';
    this.renderValues(snapshot);
  }
  private renderValues(snapshot: typeof this.controller.state.snapshot): void {
    const container = this.element.querySelector('.thermal-values');
    if (!container) return;
    container.innerHTML = snapshot ? Object.entries(snapshot.rooms).map(([id, value]) =>
      '<span class="thermal-value ' + (value.source || '') + '">' + id.replace(/_/g, ' ') + ': ' +
      (value.temperature === null ? '—' : value.temperature.toFixed(1) + ' °C') +
      (this.controller.config.visualization?.show_uncertainty && value.uncertainty !== undefined ? ' ±' + value.uncertainty.toFixed(1) : '') +
      (value.source === 'inferred' ? ' (inferred)' : '') + '</span>').join('') : '';
  }
  private escape(value: string): string {
    const div = document.createElement('div'); div.textContent = value; return div.innerHTML;
  }
  dispose(): void {
    this.controller.removeEventListener('change', this.onChange);
    this.element.removeEventListener('click', this.click);
    this.element.removeEventListener('input', this.input);
    this.element.remove();
  }
}
