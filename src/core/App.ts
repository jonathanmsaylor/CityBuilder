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
import { Placement } from "./Placement";
import { BUILDINGS } from "./Buildings";

export class App {
  private root: HTMLElement;
  private scene: Scene;
  private renderer: WebGLRenderer;
  private raycaster = new Raycaster();
  private pointerNDC = new Vector2();
private placement: Placement;

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
  this.scene.background = new Color(0x87ceeb);

  this.renderer = new WebGLRenderer({ antialias: false, alpha: false });
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  this.renderer.setSize(window.innerWidth, window.innerHeight);
  this.renderer.setClearColor(0x87ceeb, 1);
  this.root.appendChild(this.renderer.domElement);

  this.rig = new CameraRig(window.innerWidth / window.innerHeight);
  this.rig.setViewportHeight(window.innerHeight);

  // Ground
  const grid = (this.grid = new Grid(128, 128));
  const geom = new PlaneGeometry(grid.width, grid.height, 1, 1);
  geom.rotateX(-Math.PI / 2);
  const mat = new MeshStandardMaterial({
    color: new Color("#5ec46e"),
    roughness: 0.95,
    metalness: 0.0,
  });
  this.ground = new Mesh(geom, mat);
  this.scene.add(this.ground);

  // Overlay
  this.overlay = new Overlay(grid);
  this.scene.add(this.overlay.mesh);

  // Light
  const amb = new AmbientLight(0xffffff, 1.0);
  this.scene.add(amb);

  // Placement BEFORE SaveLoad so SaveLoad can serialize buildings
  this.placement = new Placement(this.grid, this.scene);

  // Services
  this.paint = new PaintService(grid, this.overlay);
  this.paint.setRadius(this.brushRadius);

  // Revalidate buildings when zones change
  this.paint.onAfterPaint((minx, miny, maxx, maxy) => {
    this.placement.validateZones(minx, miny, maxx, maxy);
  });

  // Save/Load (v2 supports buildings)
  this.saveLoad = new SaveLoad(grid, this.placement);

  // Pointer input (mobile gestures)
  new Input(this.renderer.domElement, {
    onSingleStart: (p) => this.onSingleStart(p.x, p.y),
    onSingleMove: (p) => this.onSingleMove(p.x, p.y),
    onSingleEnd: () => this.onSingleEnd(),
    onDualStart: () => {},
    onDualMove: (p1, p2) => this.onDualMove(p1.x, p1.y, p2.x, p2.y),
    onDualEnd: () => { this._prevDual = null; },
  });

  // Keyboard
  window.addEventListener("keydown", this.onKeyDown);
  window.addEventListener("keyup", this.onKeyUp);

  // Mouse wheel zoom (DEV)
  this.renderer.domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    const zoomScale = e.deltaY < 0 ? 0.9 : 1.1;
    this.rig.zoomBy(zoomScale);
  }, { passive: false });

  // Pointer hover for placement ghost (mouse move without click)
  this.renderer.domElement.addEventListener("pointermove", (e) => {
    if (this.tool.kind === "place") {
      this.updatePlacePreviewFromScreen(e.clientX, e.clientY);
    }
  }, { passive: true });
  this.renderer.domElement.addEventListener("pointerleave", () => {
    if (this.tool.kind === "place") this.placement.hidePreview();
  });

  window.addEventListener("resize", () => this.onResize());
  this.onResize();

  this.animate();
}



private onKeyDown = (e: KeyboardEvent) => {
  // Avoid hijacking input fields
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
  this.keys.add(e.code);
};
private keys = new Set<string>();
private _lastTime: number | undefined;

private onKeyUp = (e: KeyboardEvent) => {
  this.keys.delete(e.code);
};


setTool(tool: Tool) {
  this.tool = tool;
  if (tool.kind !== "place") {
    this.placement.hidePreview();
  }
}

private updatePlacePreviewFromScreen(sx: number, sy: number) {
  if (this.tool.kind !== "place") return;
  const tile = this.screenToTile(sx, sy);
  if (!tile) {
    this.placement.hidePreview();
    return;
  }
  this.placement.previewAt(this.tool.id, tile.x, tile.y);
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
  const tile = this.screenToTile(sx, sy);
  if (!tile) return;

  if (this.tool.kind === "paint" || this.tool.kind === "erase") {
    const zone = this.tool.kind === "erase" ? ZoneId.Empty : this.tool.zone;
    this.paint.strokeLine(tile.x, tile.y, tile.x, tile.y, zone);
    this.lastTile = tile;
    return;
  }

  if (this.tool.kind === "place") {
    this.placement.tryPlace(this.tool.id, tile.x, tile.y);
    // Refresh ghost right where you tapped (reflects new occupancy validity)
    this.placement.previewAt(this.tool.id, tile.x, tile.y);
    this.lastTile = null;
    return;
  }
}



private onSingleMove(sx: number, sy: number) {
  if (this.tool.kind === "place") {
    this.updatePlacePreviewFromScreen(sx, sy);
    return;
  }
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

private animate = (time?: number) => {
  // time is from rAF; fall back if undefined
  const now = time ?? performance.now();
  if (this._lastTime === undefined) this._lastTime = now;
  const dt = (now - this._lastTime) / 1000; // seconds
  this._lastTime = now;

  // Keyboard camera controls
  this.updateKeyboard(dt);

  this.renderer.render(this.scene, this.rig.camera);
  requestAnimationFrame(this.animate);
};
private updateKeyboard(dt: number) {
  if (!this.keys || this.keys.size === 0) return;

  // Pan speed in screen pixels per second (converted by rig to world units)
  const basePxPerSec = 800;
  const fast = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
  const px = basePxPerSec * (fast ? 1.8 : 1.0) * dt;

  let dx = 0;
  let dy = 0;

  // WASD / Arrow Keys
  if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) dx += px;   // left key → world pans left
  if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) dx -= px;  // right key → world pans right
  if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) dy += px;     // up key → world moves up
  if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) dy -= px;   // down key → world moves down

  if (dx !== 0 || dy !== 0) {
    this.rig.panByScreenDelta(dx, dy);
  }

  // Zoom keys: Q/E or -/=
  const zoomIn = this.keys.has("Equal") || this.keys.has("NumpadAdd") || this.keys.has("KeyE");
  const zoomOut = this.keys.has("Minus") || this.keys.has("NumpadSubtract") || this.keys.has("KeyQ");

  if (zoomIn || zoomOut) {
    const perFrame = zoomIn ? 0.985 : 1.015; // <1 = in, >1 = out
    const scale = Math.pow(perFrame, dt * 60);
    this.rig.zoomBy(scale);
  }
}


}
