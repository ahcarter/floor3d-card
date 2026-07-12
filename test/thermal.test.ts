import { ThermalLiveAdapter } from '../src/thermal/live-adapter';
import { flowScale, interpolateFrames, temperatureColor } from '../src/thermal/scales';
import { validateDataset, validateLayout, validateManifest } from '../src/thermal/validation';

let passed = 0;
const test = (name: string, run: () => void): void => { try { run(); passed++; console.log('ok - ' + name); } catch (error) { console.error('not ok - ' + name); throw error; } };
const equal = (actual: unknown, expected: unknown): void => { if (actual !== expected) throw new Error('Expected ' + String(expected) + ', got ' + String(actual)); };
const throws = (run: () => void, pattern: RegExp): void => { try { run(); } catch (error) { if (pattern.test(String(error))) return; throw error; } throw new Error('Expected function to throw'); };
const layout = validateLayout({schema_version:'thermal-flows/v1',rooms:[{id:'living_room',label:'Living',object_id:'floor'}],anchors:[{id:'inside',position:{x:0,y:0,z:0}},{id:'outside',position:{x:1,y:0,z:0}}],edges:[{id:'loss',from:'living_room',to:'outdoor',from_anchor:'inside',to_anchor:'outside',kind:'outdoor'}]});

test('validates manifest and schema versions', () => {
  equal(validateManifest({schema_version:'thermal-flows/v1',run_stamp:'r',generated_at:'2026-01-01T00:00:00Z',layout_url:'layout.json',windows:{'2h':'2h.json','24h':'24h.json','7d':'7d.json'}}).run_stamp,'r');
  throws(() => validateLayout({...layout,schema_version:'v2'}),/Unsupported/);
});
test('rejects dangling references and non-finite data', () => {
  throws(() => validateLayout({schema_version:'thermal-flows/v1',rooms:[{id:'living_room',label:'X'}],anchors:[],edges:[{id:'bad',from:'living_room',to:'nope',from_anchor:'a',to_anchor:'b',kind:'outdoor'}]}),/unknown/);
  throws(() => validateDataset({schema_version:'thermal-flows/v1',run_stamp:'r',generated_at:'2026-01-01T00:00:00Z',timezone:'UTC',interval_seconds:300,units:{temperature:'C',flow:'W'},window:'24h',frames:[{timestamp:'2026-01-01T00:00:00Z',rooms:{living_room:{temperature:Infinity}}}]},layout),/finite/);
});
test('scales signed flows by magnitude', () => {
  equal(flowScale(-25,100),flowScale(25,100));
  if (flowScale(100,100) <= flowScale(1,100)) throw new Error('flow scale is not monotonic');
});
test('maps temperatures and interpolates frames', () => {
  if (temperatureColor({temperature:16}) === temperatureColor({temperature:28})) throw new Error('temperature colors match');
  const frame=interpolateFrames({timestamp:'2026-01-01T00:00:00Z',rooms:{living_room:{temperature:20}},flows:{loss:-10}},{timestamp:'2026-01-01T00:10:00Z',rooms:{living_room:{temperature:22}},flows:{loss:10}},Date.parse('2026-01-01T00:05:00Z'));
  equal(frame.rooms.living_room.temperature,21); equal(frame.flows?.loss,0);
});
test('converts Fahrenheit and marks stale values', () => {
  const adapter=new ThermalLiveAdapter({layout_url:'layout.json',rooms:{living_room:{object_id:'floor',entity:'sensor.temp'}},stale_after_seconds:60});
  const hass={states:{'sensor.temp':{state:'68',last_updated:'2026-01-01T00:00:00Z',attributes:{unit_of_measurement:'°F'}}}};
  const first=adapter.read(hass,Date.parse('2026-01-01T01:00:00Z'));
  if (Math.abs(first!.rooms.living_room.temperature!-20)>.001) throw new Error('conversion failed');
  equal(first!.rooms.living_room.source,'inferred'); equal(adapter.read(hass),null);
});
test('tolerates unavailable sensors', () => {
  const adapter=new ThermalLiveAdapter({layout_url:'layout.json',rooms:{kitchen:{object_id:'floor',entity:'sensor.missing'}}});
  equal(adapter.read({states:{}})!.rooms.kitchen.source,'missing');
});
test('example fixtures satisfy the v1 contract', () => {
  const { readFileSync } = require('fs') as typeof import('fs');
  const read = (name: string): unknown => JSON.parse(readFileSync('examples/thermal/' + name, 'utf8'));
  const exampleLayout = validateLayout(read('layout.json'));
  const manifest = validateManifest(read('manifest.json'));
  (['2h','24h','7d'] as const).forEach(window => {
    const dataset = validateDataset(read(window + '.json'), exampleLayout);
    equal(dataset.window, window);
    equal(dataset.run_stamp, manifest.run_stamp);
    if (!dataset.frames.length) throw new Error(window + ' fixture must contain frames');
  });
});
console.log('1..' + passed);
