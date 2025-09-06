// src/core/Placement.ts
import { Scene } from "three";
import { Grid } from "./Grid";
import { BUILDINGS, BuildingBlueprint, BuildingId, makeBuildingMesh } from "./Buildings";

export class Placement {
  private preview: { mesh: any; bp: BuildingBlueprint } | null = null;

  constructor(private grid: Grid, private scene: Scene) {}

  // ----- Validation -----
  private canPlaceAt(bp: BuildingBlueprint, tx: number, ty: number): boolean {
    for (let y = 0; y < bp.h; y++) {
      for (let x = 0; x < bp.w; x++) {
        const gx = tx + x;
        const gy = ty + y;
        if (!this.grid.inBounds(gx, gy)) return false;
        const zone = this.grid.getZone(gx, gy);
        if (!bp.allowedZones.includes(zone)) return false;
        if (this.grid.occupancyMap[this.grid.idx(gx, gy)] !== 0) return false;
      }
    }
    return true;
  }

  // ----- Preview (ghost) -----
  previewAt(id: BuildingId, tx: number, ty: number) {
    const bp = BUILDINGS[id];
    if (!bp) return;

    // Create ghost if missing or blueprint changed
    if (!this.preview || this.preview.bp.id !== bp.id) {
      if (this.preview) {
        this.scene.remove(this.preview.mesh);
        (this.preview.mesh as any).geometry?.dispose?.();
        (this.preview.mesh as any).material?.dispose?.();
      }
      const ghost = makeBuildingMesh(bp);
      const mat = ghost.material as any;
      mat.transparent = true;
      mat.opacity = 0.35;
      mat.depthWrite = false;
      ghost.renderOrder = 10; // draw above ground/overlay
      this.preview = { mesh: ghost, bp };
      this.scene.add(ghost);
    }

    // Position the ghost at the footprint center
    const cx = tx + bp.w / 2;
    const cy = ty + bp.h / 2;
    const { x: wx, z: wz } = this.grid.tileCenterToWorld(cx - 0.5, cy - 0.5);
    this.preview.mesh.position.set(wx, bp.height / 2, wz);

    // Validity color
    const valid = this.canPlaceAt(bp, tx, ty);
    const mat = this.preview.mesh.material as any;
    mat.color.setHex(valid ? 0x22cc88 : 0xff5555);
  }

  hidePreview() {
    if (!this.preview) return;
    this.scene.remove(this.preview.mesh);
    (this.preview.mesh as any).geometry?.dispose?.();
    (this.preview.mesh as any).material?.dispose?.();
    this.preview = null;
  }

  // ----- Place -----
  tryPlace(id: BuildingId, tx: number, ty: number): boolean {
    const bp = BUILDINGS[id];
    if (!bp) return false;

    if (!this.canPlaceAt(bp, tx, ty)) return false;

    // Mark occupancy
    for (let y = 0; y < bp.h; y++) {
      for (let x = 0; x < bp.w; x++) {
        const gx = tx + x, gy = ty + y;
        this.grid.occupancyMap[this.grid.idx(gx, gy)] = 1;
      }
    }

    // Create and tag mesh so we can later remove it if its zone becomes invalid
    const mesh = makeBuildingMesh(bp);
    const cx = tx + bp.w / 2;
    const cy = ty + bp.h / 2;
    const { x: wx, z: wz } = this.grid.tileCenterToWorld(cx - 0.5, cy - 0.5);
    mesh.position.set(wx, bp.height / 2, wz);

    (mesh as any).userData.building = {
      id: bp.id,
      tx, ty,
      w: bp.w, h: bp.h,
      allowed: bp.allowedZones,
    };

    this.scene.add(mesh);
    return true;
  }

  // ----- React to zone edits -----
  validateZones(minx: number, miny: number, maxx: number, maxy: number) {
    const toRemove: any[] = [];

    for (const obj of this.scene.children) {
      const info = (obj as any).userData?.building;
      if (!info) continue;

      const bx0 = info.tx, by0 = info.ty;
      const bx1 = bx0 + info.w - 1, by1 = by0 + info.h - 1;

      // Skip if not intersecting dirty rect
      if (bx1 < minx || bx0 > maxx || by1 < miny || by0 > maxy) continue;

      // Re-check every tile under the building
      let valid = true;
      outer: for (let y = 0; y < info.h; y++) {
        for (let x = 0; x < info.w; x++) {
          const gx = bx0 + x, gy = by0 + y;
          if (!this.grid.inBounds(gx, gy)) { valid = false; break outer; }
          const z = this.grid.getZone(gx, gy);
          if (!info.allowed.includes(z)) { valid = false; break outer; }
        }
      }
      if (!valid) toRemove.push(obj);
    }

    // Remove invalid buildings and free occupancy
    for (const obj of toRemove) {
      const info = (obj as any).userData?.building;
      if (info) {
        for (let y = 0; y < info.h; y++) {
          for (let x = 0; x < info.w; x++) {
            const gx = info.tx + x, gy = info.ty + y;
            if (this.grid.inBounds(gx, gy)) {
              this.grid.occupancyMap[this.grid.idx(gx, gy)] = 0;
            }
          }
        }
      }
      this.scene.remove(obj);
      (obj as any).geometry?.dispose?.();
      (obj as any).material?.dispose?.();
    }
  }

  // ----- Save/Load support -----
  serialize(): Array<{ id: BuildingId; tx: number; ty: number; w: number; h: number }> {
    const out: Array<{ id: BuildingId; tx: number; ty: number; w: number; h: number }> = [];
    for (const obj of this.scene.children) {
      const info = (obj as any).userData?.building;
      if (!info) continue;
      out.push({ id: info.id as BuildingId, tx: info.tx, ty: info.ty, w: info.w, h: info.h });
    }
    return out;
  }

  clearAllBuildings() {
    const toRemove: any[] = [];
    for (const obj of this.scene.children) {
      const info = (obj as any).userData?.building;
      if (!info) continue;
      for (let y = 0; y < info.h; y++) {
        for (let x = 0; x < info.w; x++) {
          const gx = info.tx + x, gy = info.ty + y;
          if (this.grid.inBounds(gx, gy)) {
            this.grid.occupancyMap[this.grid.idx(gx, gy)] = 0;
          }
        }
      }
      toRemove.push(obj);
    }
    for (const obj of toRemove) {
      this.scene.remove(obj);
      (obj as any).geometry?.dispose?.();
      (obj as any).material?.dispose?.();
    }
  }

  load(list: Array<{ id: BuildingId; tx: number; ty: number }>) {
    for (const b of list) {
      // tryPlace will mark occupancy and instantiate mesh if valid
      this.tryPlace(b.id, b.tx, b.ty);
    }
  }
}
