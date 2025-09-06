import { Scene } from "three";
import { Grid } from "./Grid";
import { BUILDINGS, BuildingBlueprint, BuildingId, makeBuildingMesh } from "./Buildings";
import { ZoneId } from "../types/types";

export class Placement {
  constructor(private grid: Grid, private scene: Scene) {}

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

  tryPlace(id: BuildingId, tx: number, ty: number): boolean {
    const bp = BUILDINGS[id];
    if (!bp) return false;

    if (!this.canPlaceAt(bp, tx, ty)) return false;

    // mark occupancy
    for (let y = 0; y < bp.h; y++) {
      for (let x = 0; x < bp.w; x++) {
        const gx = tx + x;
        const gy = ty + y;
        this.grid.occupancyMap[this.grid.idx(gx, gy)] = 1;
      }
    }

    // create a single mesh sized to the footprint and center it on the footprint rectangle
    const mesh = makeBuildingMesh(bp);
    // center of footprint in world coords
    const cx = tx + bp.w / 2;
    const cy = ty + bp.h / 2;
    const { x: wx, z: wz } = this.grid.tileCenterToWorld(cx - 0.5, cy - 0.5);
    mesh.position.set(wx, bp.height / 2, wz);
    this.scene.add(mesh);

    return true;
  }
}
