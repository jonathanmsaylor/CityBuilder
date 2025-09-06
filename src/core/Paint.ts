// src/core/Paint.ts
import { Grid } from "./Grid";
import { Overlay } from "./Overlay";
import { ZoneId } from "../types/types";
import { ZONES } from "../theme/zones";

export class PaintService {
  private grid: Grid;
  private overlay: Overlay;
  private brushRadius = 2; // tiles

  constructor(grid: Grid, overlay: Overlay) {
    this.grid = grid;
    this.overlay = overlay;
  }

  setRadius(r: number) {
    this.brushRadius = Math.max(1, Math.floor(r));
  }

  /**
   * Stroke a line in tile space from A→B, painting zone IDs and
   * stamping a soft circular brush in the supersampled overlay.
   */
  strokeLine(ax: number, ay: number, bx: number, by: number, zone: ZoneId) {
    const dx = bx - ax;
    const dy = by - ay;
    const dist = Math.hypot(dx, dy);

    // Dense resample to avoid gaps; spacing in tiles
    const spacingTiles = 0.35;
    const steps = Math.max(1, Math.floor(dist / spacingTiles));

    // Track dirty rect in tile space for placement callbacks
    let minx = this.grid.width,
      miny = this.grid.height,
      maxx = -1,
      maxy = -1;

    const rTiles = this.brushRadius;
    const r2 = rTiles * rTiles;

    const zcol = ZONES[zone]?.color ?? ZONES[ZoneId.Empty].color;
    const ss = this.overlay.supersample;
    const radiusPx = rTiles * ss;
    const featherPx = Math.max(1, Math.round(0.75 * ss)); // soft edge

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const cx = Math.round(ax + dx * t);
      const cy = Math.round(ay + dy * t);

      // 1) Logic: write zone IDs to tiles within a circle
      for (let y = cy - rTiles; y <= cy + rTiles; y++) {
        for (let x = cx - rTiles; x <= cx + rTiles; x++) {
          if (!this.grid.inBounds(x, y)) continue;
          const ddx = x - cx,
            ddy = y - cy;
          if (ddx * ddx + ddy * ddy <= r2) {
            this.grid.setZone(x, y, zone);
            if (x < minx) minx = x;
            if (y < miny) miny = y;
            if (x > maxx) maxx = x;
            if (y > maxy) maxy = y;
          }
        }
      }

// 2) Visual: soft disc (paint or erase) in supersampled overlay
const world = this.grid.tileCenterToWorld(cx, cy);
const { px, py } = this.overlay.worldToOverlayPx(world.x, world.z);

if (zone === ZoneId.Empty) {
  // Eraser: fade out alpha smoothly
  this.overlay.eraseSoftDisc(px, py, radiusPx, featherPx);
} else {
  // Paint: blend color in with proper alpha
  this.overlay.paintSoftDisc(px, py, radiusPx, zcol, featherPx);
}

    }

    // Upload only the dirty rows we touched
    this.overlay.updateAfterPaint();

    // Optional callback (used by Placement to revalidate)
    const cb = (this as any)._afterPaint as
      | ((minx: number, miny: number, maxx: number, maxy: number) => void)
      | undefined;
    if (cb && maxx >= minx && maxy >= miny) {
      cb(minx, miny, maxx, maxy);
    }
  }

  onAfterPaint(fn: (minx: number, miny: number, maxx: number, maxy: number) => void) {
    (this as any)._afterPaint = fn;
  }
}
