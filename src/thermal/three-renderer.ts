import * as THREE from 'three';
import type { ThermalConfig, ThermalLayout, ThermalSnapshot } from './types';
import { flowScale, temperatureColor } from './scales';

interface FlowVisual { group: THREE.Group; shaft: THREE.Mesh; head: THREE.Mesh; particles: THREE.Mesh[]; start: THREE.Vector3; end: THREE.Vector3; magnitude: number }
const colors: Record<string, number> = { inter_room: 0xffb300, outdoor: 0x42a5f5, basement: 0x8d6e63, heating: 0xef5350, solar: 0xffd54f };
export class ThermalThreeRenderer {
  private root = new THREE.Group();
  private originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private tinted = new Map<THREE.Mesh, THREE.Material[]>();
  private flows = new Map<string, FlowVisual>();
  private active = false;
  private animating = true;
  private missingAnchors = new Set<string>();
  constructor(private scene: THREE.Scene, private layout: ThermalLayout, private config: ThermalConfig) {
    this.root.name = '__floor3d_thermal__'; this.scene.add(this.root);
  }
  private anchor(id: string): THREE.Vector3 | undefined {
    const a = this.layout.anchors.find(x => x.id === id);
    if (!a) return undefined;
    if (a.position) return new THREE.Vector3(a.position.x, a.position.y, a.position.z);
    const object = a.object_id ? this.scene.getObjectByName(a.object_id) : undefined;
    if (!object) {
      if (!this.missingAnchors.has(id)) console.warn('floor3d-card: thermal anchor object is missing', id, a.object_id);
      this.missingAnchors.add(id);
      return undefined;
    }
    return new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3());
  }
  private tint(objectId: string, color: string, inferred: boolean): void {
    const object = this.scene.getObjectByName(objectId); if (!object) return;
    object.traverse(child => {
      if (!(child instanceof THREE.Mesh) || !child.material) return;
      if (!this.originals.has(child)) this.originals.set(child, child.material);
      // Clone once per mesh, then mutate in place: apply() runs on every
      // playback tick, and per-frame clone+dispose churns GPU programs.
      let list = this.tinted.get(child);
      if (!list) {
        const original = this.originals.get(child)!;
        const bases = Array.isArray(original) ? original : [original];
        list = bases.map(material => {
          const clone = material.clone() as THREE.MeshStandardMaterial;
          clone.userData.baseOpacity = clone.opacity;
          clone.userData.baseTransparent = clone.transparent;
          return clone;
        });
        this.tinted.set(child, list);
      }
      list.forEach(material => {
        const standard = material as THREE.MeshStandardMaterial;
        if ('color' in standard) standard.color.set(color);
        standard.transparent = inferred || !!standard.userData.baseTransparent;
        standard.opacity = inferred
          ? Math.min(standard.userData.baseOpacity as number, .72)
          : (standard.userData.baseOpacity as number);
      });
      child.material = Array.isArray(this.originals.get(child)) ? list : list[0];
    });
  }
  private createFlow(edgeId: string, start: THREE.Vector3, end: THREE.Vector3, kind: string): FlowVisual {
    const material = new THREE.MeshBasicMaterial({ color: colors[kind] || 0xffffff, transparent: true, opacity: .85 });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 8), material);
    const head = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 10), material);
    const particles = [0, 1, 2].map(() => new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 8), material.clone()));
    const group = new THREE.Group(); group.name = '__thermal_flow_' + edgeId; group.add(shaft, head, ...particles); this.root.add(group);
    return { group, shaft, head, particles, start, end, magnitude: 0 };
  }
  apply(snapshot: ThermalSnapshot): void {
    const v = this.config.visualization || {};
    Object.entries(this.config.rooms).forEach(([id, room]) => {
      const value = snapshot.rooms[id]; if (!value) return;
      this.tint(room.object_id, temperatureColor(value, v.min_temperature, v.max_temperature, v.room_color === 'delta_to_setpoint'), value.source === 'inferred');
    });
    const max = Math.max(.0001, ...Object.values(snapshot.flows).map(Math.abs));
    this.layout.edges.forEach(edge => {
      const raw = snapshot.flows[edge.id] || 0, forward = raw >= 0;
      const a = this.anchor(forward ? edge.from_anchor : edge.to_anchor), b = this.anchor(forward ? edge.to_anchor : edge.from_anchor);
      let visual = this.flows.get(edge.id);
      if (!a || !b || Math.abs(raw) < .0001) { if (visual) visual.group.visible = false; return; }
      if (!visual) { visual = this.createFlow(edge.id, a, b, edge.kind); this.flows.set(edge.id, visual); }
      visual.group.visible = true; visual.start.copy(a); visual.end.copy(b); visual.magnitude = Math.abs(raw);
      const direction = b.clone().sub(a), length = direction.length(), middle = a.clone().addScaledVector(direction, .5);
      const width = flowScale(raw, max, v.flow_width || [.8, 4]);
      visual.shaft.position.copy(middle); visual.shaft.scale.set(width, Math.max(0, length - width * 4), width);
      visual.shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
      visual.head.position.copy(b.clone().addScaledVector(direction.clone().normalize(), -width * 2));
      visual.head.scale.set(width, width, width); visual.head.quaternion.copy(visual.shaft.quaternion);
    });
    this.active = [...this.flows.values()].some(x => x.group.visible);
  }
  setAnimating(value: boolean): void { this.animating = value; }
  animate(now: number): boolean {
    if (!this.active || !this.animating) return false;
    this.flows.forEach(flow => { if (!flow.group.visible) return; flow.particles.forEach((p, i) => {
      const phase = (now * .00025 * Math.max(1, Math.sqrt(flow.magnitude)) + i / flow.particles.length) % 1;
      p.position.lerpVectors(flow.start, flow.end, phase); p.visible = true;
    }); }); return true;
  }
  needsAnimation(): boolean { return this.active && this.animating; }
  reset(): void {
    this.originals.forEach((material, mesh) => { const current = Array.isArray(mesh.material) ? mesh.material : [mesh.material]; const original = Array.isArray(material) ? material : [material]; current.forEach(m => { if (!original.includes(m)) m.dispose(); }); mesh.material = material; });
    this.originals.clear(); this.tinted.clear(); this.flows.forEach(f => { f.group.traverse(x => { const mesh = x as THREE.Mesh; if (mesh.geometry) mesh.geometry.dispose(); const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : []; mats.forEach(m => m.dispose()); }); });
    this.flows.clear(); this.root.clear(); this.active = false;
  }
  dispose(): void { this.reset(); this.scene.remove(this.root); }
}
