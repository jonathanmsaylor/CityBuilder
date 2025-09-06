// src/core/Overlay.ts
import {
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
} from "three";
import { Grid } from "./Grid";
import { ZONES } from "../theme/zones";
import { ZoneId } from "../types/types";

export class Overlay {
  readonly grid: Grid;
  readonly geometry: PlaneGeometry;
  readonly texture: DataTexture;
  readonly material: MeshBasicMaterial;
  readonly mesh: Mesh;
// Smoothly remove tint in a circular area (feathered).
eraseSoftDisc(
  cx: number,
  cy: number,
  radiusPx: number,
  featherPx = this.featherPx
) {
  const r = Math.max(0, radiusPx);
  const f = Math.max(0.001, featherPx);
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(this.wpx - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(this.hpx - 1, Math.ceil(cy + r + 1));

  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const d = Math.sqrt(dx * dx + dy * dy);

      // Falloff amount a ∈ [0..1] inside the disc edge, 0 outside
      const a =
        d <= r ? 1 : d >= r + f ? 0 : 1 - (d - r) / f;

      if (a <= 0) continue;

      const i = (y * this.wpx + x) * 4;

      // Straight-alpha "erase": reduce existing alpha; keep RGB.
      const da = this.data[i + 3];
      const outA = Math.max(0, Math.round(da * (1 - a)));
      this.data[i + 3] = outA;

      // If fully erased, zero RGB to avoid stale bytes.
      if (outA === 0) {
        this.data[i + 0] = 0;
        this.data[i + 1] = 0;
        this.data[i + 2] = 0;
      }
    }
  }

  this.markDirtyRows(y0, y1);
}

  // Hi-res (supersampled) RGBA buffer
  private data: Uint8Array;
  private ss = 4; // supersample factor (tiles → pixels)
  private wpx: number;
  private hpx: number;

  // Dirty rows for partial GPU upload
  private dirtyY0 = Number.POSITIVE_INFINITY;
  private dirtyY1 = -1;

  // Default feather in pixels (can be tuned)
  private featherPx = 3.0;

  constructor(grid: Grid) {
    this.grid = grid;

    this.wpx = grid.width * this.ss;
    this.hpx = grid.height * this.ss;

    this.data = new Uint8Array(this.wpx * this.hpx * 4);
    this.texture = new DataTexture(
      this.data,
      this.wpx,
      this.hpx,
      RGBAFormat,
      UnsignedByteType
    );
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.flipY = false; // aligns with our world→texture math
    this.texture.needsUpdate = true;

    this.geometry = new PlaneGeometry(grid.width, grid.height, 1, 1);
    this.geometry.rotateX(-Math.PI / 2);

    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.position.set(0, 0.01, 0);

    // Build initial visual from zone map
    this.refreshAll();
  }

  /** Current supersample factor (read-only) */
  get supersample() {
    return this.ss;
  }

  /** Optional: change supersample (recreates texture & buffer). Call sparingly. */
  setSupersample(n: number) {
    const clamped = Math.max(1, Math.floor(n));
    if (clamped === this.ss) return;
    this.ss = clamped;
    this.wpx = this.grid.width * this.ss;
    this.hpx = this.grid.height * this.ss;

    this.data = new Uint8Array(this.wpx * this.hpx * 4);
    this.texture.image.data = this.data;
    this.texture.image.width = this.wpx;
    this.texture.image.height = this.hpx;
    this.texture.needsUpdate = true;

    this.refreshAll();
  }

  setFeather(px: number) {
    this.featherPx = Math.max(0, px);
  }

  /** Convert world XZ to hi-res overlay pixel coords (origin top-left of texture). */
  worldToOverlayPx(wx: number, wz: number) {
    // Match Grid.worldToTile’s orientation (Z is flipped)
    const px = (wx + this.grid.width / 2) * this.ss;
    const py = (-wz + this.grid.height / 2) * this.ss;
    return { px, py };
  }

  /** Mark rows as dirty so we can upload a smaller subrange to the GPU. */
  private markDirtyRows(y0: number, y1: number) {
    if (y0 < this.dirtyY0) this.dirtyY0 = y0;
    if (y1 > this.dirtyY1) this.dirtyY1 = y1;
  }

  /** Soft circular stamp with feathered alpha. Inputs are in overlay pixels. */
  paintSoftDisc(
    cx: number,
    cy: number,
    radiusPx: number,
    rgba: { r: number; g: number; b: number; a: number },
    featherPx = this.featherPx
  ) {
    const r = Math.max(0, radiusPx);
    const f = Math.max(0.001, featherPx);
    const x0 = Math.max(0, Math.floor(cx - r - 1));
    const x1 = Math.min(this.wpx - 1, Math.ceil(cx + r + 1));
    const y0 = Math.max(0, Math.floor(cy - r - 1));
    const y1 = Math.min(this.hpx - 1, Math.ceil(cy + r + 1));

    const br = rgba.r / 255;
    const bg = rgba.g / 255;
    const bb = rgba.b / 255;
    const ba = rgba.a / 255;

    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        const d = Math.sqrt(dx * dx + dy * dy);

        // Smooth falloff: a = 1 inside radius; fades to 0 across feather
        const a =
          d <= r
            ? 1
            : d >= r + f
            ? 0
            : 1 - (d - r) / f; // linear; visually as good as smoothstep here

        if (a <= 0) continue;

        const i = (y * this.wpx + x) * 4;
        const dr = this.data[i] / 255;
        const dg = this.data[i + 1] / 255;
        const db = this.data[i + 2] / 255;
        const da = this.data[i + 3] / 255;

        // Source alpha scaled by falloff
        const sa = ba * a;
        // "Over" compositing in straight alpha
        const outA = sa + da * (1 - sa);
        const outR = outA > 0 ? (br * sa + dr * da * (1 - sa)) / outA : 0;
        const outG = outA > 0 ? (bg * sa + dg * da * (1 - sa)) / outA : 0;
        const outB = outA > 0 ? (bb * sa + db * da * (1 - sa)) / outA : 0;

        this.data[i] = Math.round(outR * 255);
        this.data[i + 1] = Math.round(outG * 255);
        this.data[i + 2] = Math.round(outB * 255);
        this.data[i + 3] = Math.round(outA * 255);
      }
    }

    this.markDirtyRows(y0, y1);
  }

  /** Fill a hi-res pixel (utility for refresh). */
  private setHi(x: number, y: number, r: number, g: number, b: number, a: number) {
    const i = (y * this.wpx + x) * 4;
    this.data[i] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  /** Rebuild the whole visual from the zone map (used on load/boot). */
refreshAll() {
  // Clear
  this.data.fill(0);

  const ss = this.ss;
  for (let ty = 0; ty < this.grid.height; ty++) {
    for (let tx = 0; tx < this.grid.width; tx++) {
      const zone = this.grid.getZone(tx, ty);
      if (zone === ZoneId.Empty) continue;
      const zdef = ZONES[zone] ?? ZONES[ZoneId.Empty];

      // Fill the SS×SS block for this tile
      const x0 = tx * ss;
      const y0 = ty * ss;
      const x1 = x0 + ss - 1;
      const y1 = y0 + ss - 1;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const i = (y * this.wpx + x) * 4;
          this.data[i + 0] = zdef.color.r;
          this.data[i + 1] = zdef.color.g;
          this.data[i + 2] = zdef.color.b;
          this.data[i + 3] = zdef.color.a;
        }
      }
    }
  }

  // Re-upload the whole texture (fast enough at 512×512)
  this.texture.needsUpdate = true;

  // Reset dirty bounds
  this.dirtyY0 = Number.POSITIVE_INFINITY;
  this.dirtyY1 = -1;
}


  /** Flush the accumulated dirty rows to the GPU. */
updateAfterPaint() {
  // Three.js textures don’t support partial row updates via updateRange;
  // just flag a full upload — 512×512 RGBA is ~1 MB, fine on mobile.
  this.texture.needsUpdate = true;

  // Reset dirty tracking (kept for potential future use)
  this.dirtyY0 = Number.POSITIVE_INFINITY;
  this.dirtyY1 = -1;
}

}
