import {
  AmbientLight,
  Color,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Raycaster,
  Scene,
  WebGLRenderer,
  Vector2,
  Vector3,
} from "three";
import { Grid } from "./Grid";
import { Overlay } from "./Overlay";
import { PaintService } from "./Paint";
import { SaveLoad } from "./SaveLoad";
import { Input } from "./Input";
import { CameraRig } from "./CameraRig";
import { Tool, ZoneId } from "../types/types";

export class App {
  private root: HTMLElement;
  private scene: Scene;
  private renderer: WebGLRenderer;
  private raycaster = new Raycaster();
  private pointerNDC = new Vector2();

  private rig: CameraRig;
  private grid: Grid;
  private overlay: Overlay;
  private paint: PaintService;
  private saveLoad: SaveLoad;

  private ground: Mesh;
  private tool: Tool = { kind: "paint", zone: ZoneId.Residential };
  private brushRadius = 2;

  // For stroke continuity in tile coords
  private lastTile: { x: number; y: number } | null = null;

constructor(root: HTMLElement) {
  this.root = root;

  this.scene = new Scene();
  // Blue sky background
  this.scene.background = new Color(0x87ceeb);

  this.renderer = new WebGLRenderer({ antialias: false, alpha: false });
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  this.renderer.setSize(window.innerWidth, window.innerHeight);
  // Ensure clear color matches the sky, so edges don't show dark
  this.renderer.setClearColor(0x87ceeb, 1);
  this.root.appendChild(this.renderer.domElement);

  this.rig = new CameraRig(window.innerWidth / window.innerHeight);
  this.rig.setViewportHeight(window.innerHeight);

  // Ground plane (centered), now a bright grass tone
  const grid = (this.grid = new Grid(128, 128));
  const geom = new PlaneGeometry(grid.width, grid.height, 1, 1);
  geom.rotateX(-Math.PI / 2);
  const mat = new MeshStandardMaterial({
    color: new Color("#5ec46e"), // pretty grass green
    roughness: 0.95,
    metalness: 0.0,
  });
  this.ground = new Mesh(geom, mat);
  this.scene.add(this.ground);

  // Zoning overlay just above ground
  this.overlay = new Overlay(grid);
  this.scene.add(this.overlay.mesh);

  // Brighter ambient to pop colors
  const amb = new AmbientLight(0xffffff, 1.0);
  this.scene.add(amb);

  // Paint + Save/Load
  this.paint = new PaintService(grid, this.overlay);
  this.paint.setRadius(this.brushRadius);
  this.saveLoad = new SaveLoad(grid);

  // Input wiring
  new Input(this.renderer.domElement, {
    onSingleStart: (p) => this.onSingleStart(p.x, p.y),
    onSingleMove: (p) => this.onSingleMove(p.x, p.y),
    onSingleEnd: () => this.onSingleEnd(),
    onDualStart: () => {},
    onDualMove: (p1, p2) => this.onDualMove(p1.x, p1.y, p2.x, p2.y),
    onDualEnd: () => { this._prevDual = null; },
  });

  window.addEventListener("resize", () => this.onResize());
  this.onResize();

  this.animate();
}


  setTool(tool: Tool) {
    this.tool = tool;
  }

  setBrushRadius(r: number) {
    this.brushRadius = r;
    this.paint.setRadius(r);
  }

  save() {
    this.saveLoad.save();
  }

  load() {
    if (this.saveLoad.load()) {
      this.overlay.refreshAll();
    }
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.rig.setAspect(w / h);
    this.rig.setViewportHeight(h);
  }

private screenToTile(sx: number, sy: number) {
  const canvas = this.renderer.domElement;

  // Screen (CSS px) → NDC
  const rect = canvas.getBoundingClientRect();
  const x = ((sx - rect.left) / rect.width) * 2 - 1;
  const y = -(((sy - rect.top) / rect.height) * 2 - 1);
  this.pointerNDC.set(x, y);

  this.rig.camera.updateMatrixWorld();
  this.raycaster.setFromCamera(this.pointerNDC, this.rig.camera);

  // Hit the actual ground mesh for precise under-finger position
  const hits = this.raycaster.intersectObject(this.ground, false);
  if (!hits.length) return null;

  const p = hits[0].point; // world coords on ground plane
  return this.grid.worldToTile(p.x, p.z);
}



  private onSingleStart(sx: number, sy: number) {
    if (this.tool.kind === "paint" || this.tool.kind === "erase") {
      const tile = this.screenToTile(sx, sy);
      if (!tile) return;
      const zone = this.tool.kind === "erase" ? ZoneId.Empty : this.tool.zone;
      this.paint.strokeLine(tile.x, tile.y, tile.x, tile.y, zone);
      this.lastTile = tile;
    }
  }

  private onSingleMove(sx: number, sy: number) {
    if (!this.lastTile) return;
    const tile = this.screenToTile(sx, sy);
    if (!tile) return;
    const zone = this.tool.kind === "erase" ? ZoneId.Empty : (this.tool as any).zone ?? ZoneId.Residential;
    this.paint.strokeLine(this.lastTile.x, this.lastTile.y, tile.x, tile.y, zone);
    this.lastTile = tile;
  }

  private onSingleEnd() {
    this.lastTile = null;
  }

  private onDualMove(x1: number, y1: number, x2: number, y2: number) {
    // Pinch zoom + pan
    if (!this._prevDual) {
      this._prevDual = { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2, d: Math.hypot(x2 - x1, y2 - y1) };
      return;
    }
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const d = Math.hypot(x2 - x1, y2 - y1);

    const dx = cx - this._prevDual.cx;
    const dy = cy - this._prevDual.cy;
    const scale = d / this._prevDual.d || 1;

    // Pan by screen delta
    this.rig.panByScreenDelta(dx, dy);
    // Zoom by pinch scale (invert to feel natural)
    const zoomScale = Math.pow(1 / scale, 0.5);
    if (isFinite(zoomScale) && zoomScale > 0) this.rig.zoomBy(zoomScale);

    this._prevDual = { cx, cy, d };
  }
  private _prevDual: { cx: number; cy: number; d: number } | null = null;

  private animate = () => {
    this.renderer.render(this.scene, this.rig.camera);
    requestAnimationFrame(this.animate);
  };
}
