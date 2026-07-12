export const THERMAL_SCHEMA_VERSION = 'thermal-flows/v1' as const;
export type ThermalWindow = '2h' | '24h' | '7d';
export type ThermalMode = 'live' | 'playback';
export type FlowUnit = 'relative' | 'W';
export type TemperatureUnit = 'C' | 'F';
export type ValueSource = 'measured' | 'inferred' | 'missing';
export type FlowKind = 'inter_room' | 'outdoor' | 'basement' | 'heating' | 'solar';

export interface Point3 { x: number; y: number; z: number }
export interface ThermalAnchor { id: string; object_id?: string; position?: Point3 }
export interface ThermalLayoutRoom { id: string; label: string; object_id?: string; anchor_id?: string }
export interface ThermalLayoutEdge {
  id: string;
  from: string;
  to: string;
  from_anchor: string;
  to_anchor: string;
  kind: FlowKind;
}
export interface ThermalLayout {
  schema_version: typeof THERMAL_SCHEMA_VERSION;
  rooms: ThermalLayoutRoom[];
  anchors: ThermalAnchor[];
  edges: ThermalLayoutEdge[];
}
export interface ThermalRoomValue {
  temperature: number | null;
  source?: ValueSource;
  uncertainty?: number;
  setpoint?: number;
}
export interface ThermalFrame {
  timestamp: string;
  rooms: Record<string, ThermalRoomValue>;
  flows?: Record<string, number>;
  outdoor_temperature?: number;
  basement_temperature?: number;
  hvac_state?: string;
  heating_delivery?: Record<string, number>;
  solar_gain?: Record<string, number>;
  summary?: Record<string, number>;
}
export interface ThermalDataset {
  schema_version: typeof THERMAL_SCHEMA_VERSION;
  run_stamp: string;
  generated_at: string;
  timezone: string;
  interval_seconds: number;
  units: { temperature: TemperatureUnit; flow: FlowUnit };
  window: ThermalWindow;
  layout_url?: string;
  frames: ThermalFrame[];
}
export interface ThermalManifest {
  schema_version: typeof THERMAL_SCHEMA_VERSION;
  run_stamp: string;
  generated_at: string;
  layout_url: string;
  windows: Record<ThermalWindow, string>;
}
export interface ThermalRoomConfig { object_id: string; entity?: string; anchor_id?: string }
export interface ThermalVisualizationConfig {
  room_color?: 'temperature' | 'delta_to_setpoint';
  min_temperature?: number;
  max_temperature?: number;
  flow_width?: [number, number];
  show_labels?: boolean;
  show_uncertainty?: boolean;
}
export interface ThermalConfig {
  mode?: ThermalMode;
  manifest_url?: string;
  layout_url: string;
  default_window?: ThermalWindow;
  stale_after_seconds?: number;
  rooms: Record<string, ThermalRoomConfig>;
  visualization?: ThermalVisualizationConfig;
}
export interface HassStateLike {
  state: string;
  last_updated?: string;
  attributes?: Record<string, unknown>;
}
export interface HassLike { states: Record<string, HassStateLike> }
export interface ThermalSnapshot {
  mode: ThermalMode;
  timestamp: string;
  rooms: Record<string, ThermalRoomValue>;
  flows: Record<string, number>;
  hvac_state?: string;
}
