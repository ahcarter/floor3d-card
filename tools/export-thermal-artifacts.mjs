#!/usr/bin/env node
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.replace(/^--/, '').split('=');
  return [key, rest.join('=')];
}));
if (!args.frames || !args.layout || !args.published || !args.run) {
  console.error('Usage: export-thermal-artifacts --frames=frames.json --layout=layout.json --published=published --run=STAMP [--timezone=UTC]');
  process.exit(2);
}
const schema = 'thermal-flows/v1';
const sourceFrames = JSON.parse(await readFile(args.frames, 'utf8'));
const layout = JSON.parse(await readFile(args.layout, 'utf8'));
if (layout.schema_version !== schema || !Array.isArray(layout.rooms) || !Array.isArray(layout.edges)) throw new Error('Invalid thermal layout');
if (!Array.isArray(sourceFrames) || !sourceFrames.length) throw new Error('frames must be a non-empty JSON array');
sourceFrames.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
sourceFrames.forEach((frame, i) => {
  if (!Number.isFinite(Date.parse(frame.timestamp))) throw new Error('Invalid timestamp at frame ' + i);
  for (const value of Object.values(frame.flows || {})) if (!Number.isFinite(value)) throw new Error('Non-finite flow at frame ' + i);
});
const end = Date.parse(sourceFrames.at(-1).timestamp);
const windows = { '2h': 2 * 3600e3, '24h': 24 * 3600e3, '7d': 7 * 86400e3 };
const runDir = path.join(args.published, args.run, 'flows');
try { await stat(runDir); throw new Error('Immutable run already exists: ' + runDir); } catch (error) { if (error.code !== 'ENOENT') throw error; }
await mkdir(runDir, { recursive: true });
await writeFile(path.join(runDir, 'layout.json'), JSON.stringify(layout));
const generated = new Date().toISOString();
for (const [name, duration] of Object.entries(windows)) {
  let frames = sourceFrames.filter(frame => Date.parse(frame.timestamp) >= end - duration);
  const downsample = name === '7d' ? Math.max(1, Number(args['7d-step'] || 6)) : 1;
  frames = frames.filter((_, index) => index % downsample === 0 || index === frames.length - 1);
  const baseInterval = Number(args.interval || 300);
  const dataset = { schema_version: schema, run_stamp: args.run, generated_at: generated,
    timezone: args.timezone || 'UTC', interval_seconds: baseInterval * downsample,
    units: { temperature: args['temperature-unit'] || 'C', flow: args['flow-unit'] || 'relative' },
    window: name, layout_url: 'layout.json', frames };
  await writeFile(path.join(runDir, name + '.json'), JSON.stringify(dataset));
}
const manifest = { schema_version: schema, run_stamp: args.run, generated_at: generated,
  layout_url: 'layout.json', windows: { '2h': '2h.json', '24h': '24h.json', '7d': '7d.json' } };
await writeFile(path.join(runDir, 'manifest.json'), JSON.stringify(manifest));
const pointer = path.join(args.published, 'current-flows.json'), temporary = pointer + '.tmp';
await mkdir(args.published, { recursive: true });
await writeFile(temporary, JSON.stringify({ run_stamp: args.run, manifest_url: args.run + '/flows/manifest.json' }));
await rename(temporary, pointer);
// Stable manifest: the card's thermal.manifest_url points here once; its
// relative URLs re-target each run (validateManifest can't read the pointer).
const stableDir = path.join(args.published, 'flows');
await mkdir(stableDir, { recursive: true });
const prefix = '../' + args.run + '/flows/';
const stable = { ...manifest, layout_url: prefix + 'layout.json',
  windows: { '2h': prefix + '2h.json', '24h': prefix + '24h.json', '7d': prefix + '7d.json' } };
const stablePath = path.join(stableDir, 'manifest.json'), stableTmp = stablePath + '.tmp';
await writeFile(stableTmp, JSON.stringify(stable));
await rename(stableTmp, stablePath);
console.log(runDir);
