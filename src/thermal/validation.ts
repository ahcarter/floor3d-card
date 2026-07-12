import { THERMAL_SCHEMA_VERSION } from './types';
import type { FlowKind, ThermalDataset, ThermalLayout, ThermalManifest, ThermalWindow } from './types';

export class ThermalValidationError extends Error {
  constructor(message: string) { super(message); this.name = 'ThermalValidationError'; }
}
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, path: string): string => {
  if (typeof v !== 'string' || !v.trim()) throw new ThermalValidationError(path + ' must be a non-empty string');
  return v;
};
const finite = (v: unknown, path: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new ThermalValidationError(path + ' must be finite');
  return v;
};
const iso = (v: unknown, path: string): string => {
  const value = text(v, path);
  if (!Number.isFinite(Date.parse(value))) throw new ThermalValidationError(path + ' must be an ISO timestamp');
  return value;
};
const schema = (v: unknown): void => {
  if (v !== THERMAL_SCHEMA_VERSION) {
    throw new ThermalValidationError('Unsupported schema_version "' + String(v) + '"; expected ' + THERMAL_SCHEMA_VERSION);
  }
};
const url = (v: unknown, path: string): string => text(v, path);
const allowedKinds: FlowKind[] = ['inter_room', 'outdoor', 'basement', 'heating', 'solar'];
const allowedWindows: ThermalWindow[] = ['2h', '24h', '7d'];
const allowedRooms = new Set(['living_room', 'dining_room', 'kitchen', 'bedroom', 'basement']);

export function validateLayout(input: unknown): ThermalLayout {
  if (!object(input)) throw new ThermalValidationError('layout must be an object');
  schema(input.schema_version);
  if (!Array.isArray(input.rooms) || !input.rooms.length) throw new ThermalValidationError('rooms must not be empty');
  if (!Array.isArray(input.anchors)) throw new ThermalValidationError('anchors must be an array');
  if (!Array.isArray(input.edges)) throw new ThermalValidationError('edges must be an array');
  const ids = new Set<string>();
  const rooms = input.rooms.map((raw, i) => {
    if (!object(raw)) throw new ThermalValidationError('rooms[' + i + '] must be an object');
    const id = text(raw.id, 'rooms[' + i + '].id');
    if (!allowedRooms.has(id)) throw new ThermalValidationError('unsupported room id ' + id);
    if (ids.has(id)) throw new ThermalValidationError('duplicate room id ' + id);
    ids.add(id);
    return { id, label: text(raw.label, 'rooms[' + i + '].label'),
      ...(raw.object_id === undefined ? {} : { object_id: text(raw.object_id, 'rooms[' + i + '].object_id') }),
      ...(raw.anchor_id === undefined ? {} : { anchor_id: text(raw.anchor_id, 'rooms[' + i + '].anchor_id') }) };
  });
  const anchorIds = new Set<string>();
  const anchors = input.anchors.map((raw, i) => {
    if (!object(raw)) throw new ThermalValidationError('anchors[' + i + '] must be an object');
    const id = text(raw.id, 'anchors[' + i + '].id');
    if (anchorIds.has(id)) throw new ThermalValidationError('duplicate anchor id ' + id);
    anchorIds.add(id);
    let position;
    if (raw.position !== undefined) {
      if (!object(raw.position)) throw new ThermalValidationError('anchors[' + i + '].position must be an object');
      position = { x: finite(raw.position.x, 'anchor.x'), y: finite(raw.position.y, 'anchor.y'), z: finite(raw.position.z, 'anchor.z') };
    }
    const objectId = raw.object_id === undefined ? undefined : text(raw.object_id, 'anchors[' + i + '].object_id');
    if (!objectId && !position) throw new ThermalValidationError('anchor ' + id + ' needs object_id or position');
    return { id, ...(objectId ? { object_id: objectId } : {}), ...(position ? { position } : {}) };
  });
  const edgeIds = new Set<string>();
  const external = new Set(['outdoor', 'basement', 'hvac', 'solar']);
  const edges = input.edges.map((raw, i) => {
    if (!object(raw)) throw new ThermalValidationError('edges[' + i + '] must be an object');
    const id = text(raw.id, 'edges[' + i + '].id');
    if (edgeIds.has(id)) throw new ThermalValidationError('duplicate edge id ' + id);
    edgeIds.add(id);
    const from = text(raw.from, 'edges[' + i + '].from'), to = text(raw.to, 'edges[' + i + '].to');
    if (!ids.has(from) && !external.has(from)) throw new ThermalValidationError('edge ' + id + ' references unknown from room ' + from);
    if (!ids.has(to) && !external.has(to)) throw new ThermalValidationError('edge ' + id + ' references unknown to room ' + to);
    const from_anchor = text(raw.from_anchor, 'edges[' + i + '].from_anchor');
    const to_anchor = text(raw.to_anchor, 'edges[' + i + '].to_anchor');
    if (!anchorIds.has(from_anchor) || !anchorIds.has(to_anchor)) throw new ThermalValidationError('edge ' + id + ' references an unknown anchor');
    const kind = text(raw.kind, 'edges[' + i + '].kind') as FlowKind;
    if (!allowedKinds.includes(kind)) throw new ThermalValidationError('edge ' + id + ' has invalid kind');
    return { id, from, to, from_anchor, to_anchor, kind };
  });
  rooms.forEach(room => { if (room.anchor_id && !anchorIds.has(room.anchor_id)) throw new ThermalValidationError('room ' + room.id + ' references an unknown anchor'); });
  return { schema_version: THERMAL_SCHEMA_VERSION, rooms, anchors, edges };
}

export function validateDataset(input: unknown, layout?: ThermalLayout): ThermalDataset {
  if (!object(input)) throw new ThermalValidationError('dataset must be an object');
  schema(input.schema_version);
  if (!object(input.units) || !['C', 'F'].includes(String(input.units.temperature)) || !['relative', 'W'].includes(String(input.units.flow))) {
    throw new ThermalValidationError('units must specify temperature C/F and flow relative/W');
  }
  const window = text(input.window, 'window') as ThermalWindow;
  if (!allowedWindows.includes(window)) throw new ThermalValidationError('invalid window ' + window);
  const interval = finite(input.interval_seconds, 'interval_seconds');
  if (interval <= 0) throw new ThermalValidationError('interval_seconds must be positive');
  if (!Array.isArray(input.frames)) throw new ThermalValidationError('frames must be an array');
  const roomIds = new Set(layout?.rooms.map(r => r.id) || []);
  const edgeIds = new Set(layout?.edges.map(e => e.id) || []);
  let previous = -Infinity;
  const frames = input.frames.map((raw, i) => {
    if (!object(raw) || !object(raw.rooms)) throw new ThermalValidationError('frames[' + i + '] must contain rooms');
    const timestamp = iso(raw.timestamp, 'frames[' + i + '].timestamp'), epoch = Date.parse(timestamp);
    if (epoch <= previous) throw new ThermalValidationError('frame timestamps must be strictly increasing');
    previous = epoch;
    const rooms: Record<string, any> = {};
    Object.entries(raw.rooms).forEach(([id, value]) => {
      if (layout && !roomIds.has(id)) throw new ThermalValidationError('frame references unknown room ' + id);
      if (!object(value)) throw new ThermalValidationError('room value ' + id + ' must be an object');
      const temperature = value.temperature === null ? null : finite(value.temperature, 'temperature');
      const source = value.source === undefined ? undefined : text(value.source, 'source');
      if (source && !['measured', 'inferred', 'missing'].includes(source)) throw new ThermalValidationError('invalid source for ' + id);
      rooms[id] = { temperature, ...(source ? { source } : {}),
        ...(value.uncertainty === undefined ? {} : { uncertainty: finite(value.uncertainty, 'uncertainty') }),
        ...(value.setpoint === undefined ? {} : { setpoint: finite(value.setpoint, 'setpoint') }) };
    });
    const flows: Record<string, number> = {};
    if (raw.flows !== undefined) {
      if (!object(raw.flows)) throw new ThermalValidationError('flows must be an object');
      Object.entries(raw.flows).forEach(([id, value]) => {
        if (layout && !edgeIds.has(id)) throw new ThermalValidationError('frame references unknown edge ' + id);
        flows[id] = finite(value, 'flow ' + id);
      });
    }
    const numericRecord = (name: string): Record<string, number> | undefined => {
      const value = raw[name];
      if (value === undefined) return undefined;
      if (!object(value)) throw new ThermalValidationError(name + ' must be an object');
      const result: Record<string, number> = {};
      Object.entries(value).forEach(([id, item]) => { result[id] = finite(item, name + '.' + id); });
      return result;
    };
    const outdoor_temperature = raw.outdoor_temperature === undefined ? undefined : finite(raw.outdoor_temperature, 'outdoor_temperature');
    const basement_temperature = raw.basement_temperature === undefined ? undefined : finite(raw.basement_temperature, 'basement_temperature');
    return { ...raw, timestamp, rooms, flows, outdoor_temperature, basement_temperature,
      heating_delivery: numericRecord('heating_delivery'), solar_gain: numericRecord('solar_gain'), summary: numericRecord('summary') } as any;
  });
  return { schema_version: THERMAL_SCHEMA_VERSION, run_stamp: text(input.run_stamp, 'run_stamp'),
    generated_at: iso(input.generated_at, 'generated_at'), timezone: text(input.timezone, 'timezone'),
    interval_seconds: interval, units: input.units as any, window, frames,
    ...(input.layout_url === undefined ? {} : { layout_url: url(input.layout_url, 'layout_url') }) };
}

export function validateManifest(input: unknown): ThermalManifest {
  if (!object(input)) throw new ThermalValidationError('manifest must be an object');
  schema(input.schema_version);
  const rawWindows = input.windows;
  if (!object(rawWindows)) throw new ThermalValidationError('windows must be an object');
  const windows = {} as Record<ThermalWindow, string>;
  allowedWindows.forEach(w => { windows[w] = url(rawWindows[w], 'windows.' + w); });
  return { schema_version: THERMAL_SCHEMA_VERSION, run_stamp: text(input.run_stamp, 'run_stamp'),
    generated_at: iso(input.generated_at, 'generated_at'), layout_url: url(input.layout_url, 'layout_url'), windows };
}

export function resolveArtifactUrl(value: string, base: string): string {
  return new URL(value, base).toString();
}
