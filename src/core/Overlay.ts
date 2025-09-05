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

  private data: Uint8Array;

  constructor(grid: Grid) {
    this.grid = grid;

    // DataTexture sized to grid
    this.data = new Uint8Array(grid.width * grid.height * 4);
    this.texture = new DataTexture(
      this.data,
      grid.width,
      grid.height,
      RGBAFormat,
      UnsignedByteType
    );
    this.texture.magFilter = NearestFilter;
    this.texture.minFilter = NearestFilter;
    this.texture.needsUpdate = true;

    // Plane the same size as the grid, UV 0..1
    this.geometry = new PlaneGeometry(grid.width, grid.height, 1, 1);
    this.geometry.rotateX(-Math.PI / 2);

    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.position.set(0, 0.01, 0); // just above the ground to avoid z-fighting

    // Initialize texture
    this.refreshAll();
  }

  private setPixel(x: number, y: number, r: number, g: number, b: number, a: number) {
    const i = (y * this.grid.width + x) * 4;
    this.data[i + 0] = r;
    this.data[i + 1] = g;
    this.data[i + 2] = b;
    this.data[i + 3] = a;
  }

  setTileFromZone(x: number, y: number, zone: ZoneId) {
    const zdef = ZONES[zone] ?? ZONES[ZoneId.Empty];
    this.setPixel(x, y, zdef.color.r, zdef.color.g, zdef.color.b, zdef.color.a);
  }

  refreshAll() {
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        this.setTileFromZone(x, y, this.grid.getZone(x, y));
      }
    }
    this.texture.needsUpdate = true;
  }

  // Lightly-optimized: mark a small rect and update entire tex (simple & fine for 128x128)
  updateAfterPaint() {
    this.refreshAll();
  }
}
