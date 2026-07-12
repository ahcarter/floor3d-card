import type { ThermalDataset, ThermalLayout, ThermalManifest, ThermalWindow } from './types';
import { resolveArtifactUrl, validateDataset, validateLayout, validateManifest } from './validation';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
export class ThermalPlaybackAdapter {
  manifest?: ThermalManifest;
  layout?: ThermalLayout;
  datasets = new Map<ThermalWindow, ThermalDataset>();
  constructor(private manifestUrl: string, private fetcher: FetchLike = fetch) {}
  private async json(url: string): Promise<unknown> {
    const response = await this.fetcher(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error('Thermal artifact request failed (' + response.status + ')');
    return response.json();
  }
  async load(window: ThermalWindow, configuredLayoutUrl?: string): Promise<{ layout: ThermalLayout; dataset: ThermalDataset }> {
    if (!this.manifest) this.manifest = validateManifest(await this.json(this.manifestUrl));
    const layoutUrl = resolveArtifactUrl(configuredLayoutUrl || this.manifest.layout_url, this.manifestUrl);
    if (!this.layout) this.layout = validateLayout(await this.json(layoutUrl));
    let dataset = this.datasets.get(window);
    if (!dataset) {
      dataset = validateDataset(await this.json(resolveArtifactUrl(this.manifest.windows[window], this.manifestUrl)), this.layout);
      if (dataset.run_stamp !== this.manifest.run_stamp) throw new Error('Thermal dataset run does not match manifest run');
      this.datasets.set(window, dataset);
    }
    return { layout: this.layout, dataset };
  }
}
