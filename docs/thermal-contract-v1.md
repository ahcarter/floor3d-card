# Thermal flows visualization contract v1

The card and the companion 2D `/flows` view consume the same static artifacts. Browsers never read the model database.

## Artifacts

- `layout.json` is stable spatial data: rooms, semantic anchors, and directed edges.
- `manifest.json` points at one immutable published run and its `2h`, `24h`, and `7d` datasets.
- Window datasets contain ordered frames. Use five-minute frames for 2h/24h and a downsampled interval for 7d.

All files use `schema_version: thermal-flows/v1`. Temperatures are `C` or `F`; flows are `relative` or `W`.
Every edge has a fixed positive direction from `from_anchor` to `to_anchor`. A negative frame value reverses the rendered direction.

Room IDs in v1 are the fixed set `living_room`, `dining_room`, `kitchen`, `bedroom`, and optional
`basement` — the runtime rejects any other id (a future schema version may relax this).
External endpoints are `outdoor`, `basement`, `hvac`, and `solar`.

The runtime rejects unknown schema versions, invalid timestamps/non-finite values, duplicate IDs, bad units, and dangling room/edge/anchor references. Partial frames are accepted and displayed as missing.

See [the JSON Schema](./thermal-flows-v1.schema.json) and [anonymous fixtures](../examples/thermal/).

## Exporter

`tools/export-thermal-artifacts.mjs` accepts a registry run stamp, a static layout, and the model's published frame array. It writes immutable window artifacts and atomically replaces `current-flows.json` only after all run files succeed:

```text
node tools/export-thermal-artifacts.mjs --frames=model-frames.json --layout=thermal-layout.json --published=published --run=20260711T000000Z --timezone=America/Los_Angeles
```

Use `--7d-step=6` (the default) to turn five-minute frames into 30-minute 7d frames. The source analysis project should invoke this only after its immutable run is registered; SQLite is never exposed.
## Publishing

Write artifacts under an immutable run directory, then atomically update only the existing current-run pointer. The manifest's `run_stamp` must match every dataset it exposes. Relative URLs are resolved against the manifest URL.

## Model naming

Keep deployment geometry and entity IDs private. For a Sweet Home 3D export, retain semantic object names such as `room_living_floor`, `anchor_living_dining`, `vent_living_supply`, and `boundary_kitchen_outdoor`. Use centimetres consistently, place the plan origin at the upper-left, document north, and verify object names after every OBJ → GLB conversion.

Before deployment:

1. Inspect the GLB and confirm every configured room object and anchor exists.
2. Confirm north, scale, origin, and floor elevation.
3. Copy the GLB, layout, manifest, and immutable data windows into Home Assistant's static files.
4. Open browser developer tools and confirm no schema or missing-anchor warnings.
