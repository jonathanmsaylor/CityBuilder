// src/core/App.ts
// UPDATED: wire Jobs + Pathing; expose worker counters to HUD
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
import { Spawner } from "./Spawner";
import { Resources } from "./Resources";
import { initHUD } from "../ui/hud";
import { Jobs } from "./Jobs";

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

  private lastTile: { x: number; y: number } | null = null;

  private spawner!: Spawner;
  private resources!: Resources;
  private jobs!: Jobs;

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

    // Placement
    this.placement = new Placement(this.grid, this.scene);

    // Resources (before spawner so it can gate huts)
    this.resources = new Resources(this.placement);
    this.resources.load();

    // Spawner (gated by resources)
    this.spawner = new Spawner(this.grid, this.placement, this.resources);

    // Jobs (workers, movement, farm production)
    this.jobs = new Jobs(this.grid, this.placement, this.resources, this.scene);

    // Services
    this.paint = new PaintService(grid, this.overlay);
    this.paint.setRadius(this.brushRadius);

    // Zones changed → validate buildings + enqueue spawn
    this.paint.onAfterPaint((minx, miny, maxx, maxy) => {
      this.placement.validateZones(minx, miny, maxx, maxy);
      this.spawner.enqueueRect(minx, miny, maxx, maxy);
    });

    // Save/Load (buildings + zones handled by SaveLoad)
    this.saveLoad = new SaveLoad(grid, this.placement);

    // Input
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

    // Hover ghost
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

    // HUD
    initHUD(this);

    this.animate();
  }

  // --- HUD accessors ---
  getRations() { return this.resources.getRations(); }
  getPopulation() { return this.resources.getPopulation(); }
  getWorkersAssigned() { return this.jobs.getWorkersAssigned(); }
  getWorkersNeeded() { return this.jobs.getWorkersNeeded(); }

  // --- Tooling ---
  setTool(tool: Tool) {
    this.tool = tool;
    if (tool.kind !== "place") {
      this.placement.hidePreview();
    }
  }

  setBrushRadius(r: number) {
    this.brushRadius = r;
    this.paint.setRadius(r);
  }

  save() {
    this.saveLoad.save();
    this.resources.save();
  }

  load() {
    if (this.saveLoad.load()) {
      this.overlay.refreshAll();
    }
    this.resources.load();
  }

  // --- Sizing ---
  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.rig.setAspect(w / h);
    this.rig.setViewportHeight(h);
  }

  // --- Screen → tile ---
  private screenToTile(sx: number, sy: number) {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const x = ((sx - rect.left) / rect.width) * 2 - 1;
    const y = -(((sy - rect.top) / rect.height) * 2 - 1);
    this.pointerNDC.set(x, y);

    this.rig.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointerNDC, this.rig.camera);

    const hits = this.raycaster.intersectObject(this.ground, false);
    if (!hits.length) return null;

    const p = hits[0].point;
    return this.grid.worldToTile(p.x, p.z);
  }

  // --- Input handlers ---
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
      this.placement.tryPlace((this.tool as any).id, tile.x, tile.y);
      this.placement.previewAt((this.tool as any).id, tile.x, tile.y);
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

  private onSingleEnd() { this.lastTile = null; }

  private updatePlacePreviewFromScreen(sx: number, sy: number) {
    if (this.tool.kind !== "place") return;
    const tile = this.screenToTile(sx, sy);
    if (!tile) {
      this.placement.hidePreview();
      return;
    }
    this.placement.previewAt((this.tool as any).id, tile.x, tile.y);
  }

  private onDualMove(x1: number, y1: number, x2: number, y2: number) {
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

    this.rig.panByScreenDelta(dx, dy);
    const zoomScale = Math.pow(1 / scale, 0.5);
    if (isFinite(zoomScale) && zoomScale > 0) this.rig.zoomBy(zoomScale);

    this._prevDual = { cx, cy, d };
  }
  private _prevDual: { cx: number; cy: number; d: number } | null = null;

  // --- Keyboard ---
  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
    this.keys.add(e.code);
  };
  private keys = new Set<string>();
  private _lastTime: number | undefined;
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };

  private updateKeyboard(dt: number) {
    if (!this.keys || this.keys.size === 0) return;
    const basePxPerSec = 800;
    const fast = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    const px = basePxPerSec * (fast ? 1.8 : 1.0) * dt;

    let dx = 0, dy = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) dx += px;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) dx -= px;
    if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) dy += px;
    if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) dy -= px;

    if (dx !== 0 || dy !== 0) this.rig.panByScreenDelta(dx, dy);

    const zoomIn = this.keys.has("Equal") || this.keys.has("NumpadAdd") || this.keys.has("KeyE");
    const zoomOut = this.keys.has("Minus") || this.keys.has("NumpadSubtract") || this.keys.has("KeyQ");
    if (zoomIn || zoomOut) {
      const perFrame = zoomIn ? 0.985 : 1.015;
      const scale = Math.pow(perFrame, dt * 60);
      this.rig.zoomBy(scale);
    }
  }

  // --- Loop ---
  private animate = (time?: number) => {
    const now = time ?? performance.now();
    if (this._lastTime === undefined) this._lastTime = now;
    const dt = (now - this._lastTime) / 1000;
    this._lastTime = now;

    this.updateKeyboard(dt);
    this.resources.update(dt); // consumption + pop
    this.jobs.update(dt);      // workers, paths, farm production
    this.spawner.update(dt);   // gated hut spawning

    this.renderer.render(this.scene, this.rig.camera);
    requestAnimationFrame(this.animate);
  };
}
