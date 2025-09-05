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
    const steps = Math.max(1, Math.floor(dist * 2)); // ~0.5 tile spacing
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(ax + dx * t);
      const y = Math.round(ay + dy * t);
      this.paintDisc(x, y, zone);
    }
    this.overlay.updateAfterPaint();
  }
}
