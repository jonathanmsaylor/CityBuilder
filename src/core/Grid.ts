import { ZoneId } from "../types/types";

export class Grid {
  readonly width: number;
  readonly height: number;
  readonly zoneMap: Uint8Array;      // zone id per tile
  readonly occupancyMap: Uint8Array; // 0/1 occupancy (reserved for Sprint 2)

  constructor(width = 128, height = 128) {
    this.width = width;
    this.height = height;
    this.zoneMap = new Uint8Array(width * height);
    this.occupancyMap = new Uint8Array(width * height);
  }

  idx(x: number, y: number) {
    return y * this.width + x;
  }

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  getZone(x: number, y: number): ZoneId {
    if (!this.inBounds(x, y)) return ZoneId.Empty;
    return this.zoneMap[this.idx(x, y)] as ZoneId;
  }

  setZone(x: number, y: number, z: ZoneId) {
    if (!this.inBounds(x, y)) return;
    this.zoneMap[this.idx(x, y)] = z;
  }

  // World <-> tile mapping (plane centered at origin, XZ plane)
  worldToTile(wx: number, wz: number) {
  // Flip Z so dragging upward on the screen maps to a *smaller* tile row index visually higher up.
  // This makes the brush follow your finger directionally.
  const ox = wx + this.width / 2;
  const oy = -wz + this.height / 2; // <-- flipped Z
  const x = Math.floor(ox);
  const y = Math.floor(oy);
  if (!this.inBounds(x, y)) return null;
  return { x, y };
}


tileCenterToWorld(x: number, y: number) {
  // Keep tile->world consistent with the flipped Z above.
  const wx = x + 0.5 - this.width / 2;
  const wz = -(y + 0.5 - this.height / 2);
  return { x: wx, z: wz };
}

}
