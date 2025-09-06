import { Grid } from "./Grid";
import { ZoneId } from "../types/types";
import { Overlay } from "./Overlay";

export class PaintService {
  private grid: Grid;
  private overlay: Overlay;

  brushRadius = 2;

  constructor(grid: Grid, overlay: Overlay) {
    this.grid = grid;
    this.overlay = overlay;
  }

  setRadius(r: number) {
    this.brushRadius = Math.max(1, Math.min(12, Math.floor(r)));
  }

  // Paint a filled disc centered at tile (cx, cy)
  private paintDisc(cx: number, cy: number, zone: ZoneId) {
    const r = this.brushRadius;
    const r2 = r * r;
    const minx = Math.max(0, cx - r);
    const maxx = Math.min(this.grid.width - 1, cx + r);
    const miny = Math.max(0, cy - r);
    const maxy = Math.min(this.grid.height - 1, cy + r);
    for (let y = miny; y <= maxy; y++) {
      for (let x = minx; x <= maxx; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          this.grid.setZone(x, y, zone);
        }
      }
    }
  }

  // Sample along the line from (ax,ay) to (bx,by) at ~0.5 tile spacing
strokeLine(ax: number, ay: number, bx: number, by: number, zone: ZoneId) {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy);

  // Brush spacing factor: lower = denser, smoother; higher = lighter, faster
  const spacing = 0.35; // try 0.25 for very smooth, 0.5 for faster but rougher
  const steps = Math.max(1, Math.floor(dist / spacing));

  // Track dirty rect
  let minx = this.grid.width, miny = this.grid.height, maxx = -1, maxy = -1;

for (let i = 0; i <= steps; i++) {
  const t = i / steps;
  const cx = Math.round(ax + dx * t);
  const cy = Math.round(ay + dy * t);

  // Draw circular brush by checking distance
  const r = this.brushRadius;
  const r2 = r * r;
  for (let y = cy - r; y <= cy + r; y++) {
    for (let x = cx - r; x <= cx + r; x++) {
      if (!this.grid.inBounds(x, y)) continue;
      const ddx = x - cx, ddy = y - cy;
      if (ddx * ddx + ddy * ddy <= r2) {
        this.grid.setZone(x, y, zone);
      }
    }
  }

  if (cx - r < minx) minx = cx - r;
  if (cy - r < miny) miny = cy - r;
  if (cx + r > maxx) maxx = cx + r;
  if (cy + r > maxy) maxy = cy + r;
}


  this.overlay.updateAfterPaint();

  const cb = (this as any)._afterPaint as
    | ((minx: number, miny: number, maxx: number, maxy: number) => void)
    | undefined;
  if (cb && maxx >= minx && maxy >= miny) {
    cb(minx, miny, maxx, maxy);
  }
}

onAfterPaint(fn: (minx: number, miny: number, maxx: number, maxy: number) => void) {
  // Store without changing class fields to keep the edit surgical
  (this as any)._afterPaint = fn;
}

}
