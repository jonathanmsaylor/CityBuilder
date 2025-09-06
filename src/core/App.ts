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
} from "three";
import { Grid } from "./Grid";
import { Overlay } from "./Overlay";
import { PaintService } from "./Paint";
import { SaveLoad } from "./SaveLoad";
import { Input } from "./Input";
import { CameraRig } from "./CameraRig";
import { Tool, ZoneId } from "../types/types";
import { Placement } from "./Placement";
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
// --- anti-accidental-paint (pinch guard) ---
private twoFingerActive = false;
private pendingPaintTimeout: number | null = null;
private pendingStartTile: { x: number; y: number } | null = null;

private cancelPendingPaint() {
  if (this.pendingPaintTimeout !== null) {
    clearTimeout(this.pendingPaintTimeout);
    this.pendingPaintTimeout = null;
  }
  this.pendingStartTile = null;
}

  private rig: CameraRig;
  private grid: Grid;
  private overlay: Overlay;
  private placement: Placement;
  private paint: PaintService;
  private saveLoad: SaveLoad;
  private resources: Resources;
  private spawner: Spawner;
  private jobs: Jobs;

  private ground: Mesh;
  private tool: Tool = { kind: "paint", zone: ZoneId.Residential };
  private brushRadius = 2;

  private lastTile: { x: number; y: number } | null = null;
// src/core/App.ts  (inside class App)
private updatePlacePreviewFromScreen(sx: number, sy: number) {
  if (this.tool.kind !== "place") return;
  const tile = this.screenToTile(sx, sy);
  if (!tile) {
    this.placement.hidePreview();
    return;
  }
  const id = (this.tool as any).id; // placement tool carries an id
  this.placement.previewAt(id, tile.x, tile.y);
}

constructor(root: HTMLElement) {
  this.root = root;

  // Scene & renderer
  this.scene = new Scene();
  this.scene.background = new Color(0x87ceeb);

  this.renderer = new WebGLRenderer({ antialias: false, alpha: false });
  this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  this.renderer.setSize(window.innerWidth, window.innerHeight);
  this.renderer.setClearColor(0x87ceeb, 1);
  this.root.appendChild(this.renderer.domElement);

  // Camera rig
  this.rig = new CameraRig(window.innerWidth / window.innerHeight);
  this.rig.setViewportHeight(window.innerHeight);

  // Grid & ground
  const grid = (this.grid = new Grid(128, 128));
  this.rig.setWorldSize(this.grid.width, this.grid.height);

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
this.installPointerRotate();   // ← call once here
  // Light
  const amb = new AmbientLight(0xffffff, 1.0);
  this.scene.add(amb);

  // Placement / systems
  this.placement = new Placement(this.grid, this.scene);
  this.resources = new Resources(this.placement);
  this.spawner = new Spawner(this.grid, this.placement, this.resources);
  this.jobs = new Jobs(this.grid, this.placement, this.resources, this.scene);

  // Paint service
  this.paint = new PaintService(grid, this.overlay);
  this.paint.setRadius(this.brushRadius);

  // Zones changed → validate buildings + enqueue spawn
  this.paint.onAfterPaint((minx, miny, maxx, maxy) => {
    this.placement.validateZones(minx, miny, maxx, maxy);
    this.spawner.enqueueRect(minx, miny, maxx, maxy);
  });

  // Save/Load
  this.saveLoad = new SaveLoad(grid, this.placement);



  // Touch input
new Input(this.renderer.domElement, {
  onSingleStart: (p) => this.onSingleStart(p.x, p.y),
  onSingleMove:  (p) => this.onSingleMove(p.x, p.y),
  onSingleEnd:   () => this.onSingleEnd(),

  // ↓↓↓ update these two ↓↓↓
  onDualStart:   () => this.onDualStart(),
  onDualMove:    (p1, p2) => this.onDualMove(p1.x, p1.y, p2.x, p2.y),
  onDualEnd:     () => this.onDualEnd(),
});


  // Keyboard
  window.addEventListener("keydown", this.onKeyDown);
  window.addEventListener("keyup", this.onKeyUp);

  // Scroll wheel zoom (DEV)
  this.renderer.domElement.addEventListener("wheel", (e) => {
    e.preventDefault();
    const zoomScale = e.deltaY < 0 ? 0.9 : 1.1;
    this.rig.zoomBy(zoomScale);
  }, { passive: false });

  // Hover ghost for placement
  this.renderer.domElement.addEventListener("pointermove", (e) => {
    if (this.tool.kind === "place") this.updatePlacePreviewFromScreen(e.clientX, e.clientY);
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




  // HUD accessors
  getRations() {
    return this.resources.getRations();
  }
  getPopulation() {
    return this.resources.getPopulation();
  }
  getWorkersAssigned() {
    return this.jobs.getWorkersAssigned();
  }
  getWorkersNeeded() {
    return this.jobs.getWorkersNeeded();
  }

  // Tools
  setTool(tool: Tool) {
    this.tool = tool;
    if (tool.kind !== "place") this.placement.hidePreview();
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
    if (this.saveLoad.load()) this.overlay.refreshAll();
    this.resources.load();
  }

  // Resize
  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.rig.setAspect(w / h);
    this.rig.setViewportHeight(h);
  }

  // Screen → tile
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

  // Input handlers
// src/core/App.ts  (inside class App)
private onSingleStart(sx: number, sy: number) {
  const tile = this.screenToTile(sx, sy);
  if (!tile) return;

  if (this.tool.kind === "paint" || this.tool.kind === "erase") {
    if (this.twoFingerActive) return; // if a second finger is already down, ignore

    // Defer the very first dab so a quick pinch won't paint a dot.
    this.cancelPendingPaint();
    this.pendingStartTile = tile;
    this.lastTile = tile;

    const zone = this.tool.kind === "erase" ? ZoneId.Empty : this.tool.zone;
    this.pendingPaintTimeout = window.setTimeout(() => {
      // only commit if still single-finger
      if (!this.twoFingerActive && this.pendingStartTile) {
        const t = this.pendingStartTile;
        this.paint.strokeLine(t.x, t.y, t.x, t.y, zone);
      }
      this.pendingPaintTimeout = null;
    }, 80); // 60–100ms works well
    return;
  }

  if (this.tool.kind === "place") {
    const id = (this.tool as any).id;
    this.placement.tryPlace(id, tile.x, tile.y);
    this.placement.previewAt(id, tile.x, tile.y);
    this.lastTile = null;
  }
}


// src/core/App.ts
private installPointerRotate() {
  const el = this.renderer.domElement;

  // Stop the browser context menu so RMB-drag is clean
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  let rotating = false;
  let lastX = 0;
  let activePointer = -1;

  // Capture-phase so we run BEFORE Input’s listeners and can block them
  el.addEventListener("pointerdown", (e) => {
    // Rotate on RIGHT mouse (button=2). Also allow MIDDLE (button=1) for convenience.
    const isRotateButton = e.pointerType === "mouse" && (e.button === 2 || e.button === 1);
    if (!isRotateButton) return;

    rotating = true;
    lastX = e.clientX;
    activePointer = e.pointerId;

    try { el.setPointerCapture(e.pointerId); } catch {}
    e.preventDefault();
    e.stopPropagation();            // block target/bubble
    e.stopImmediatePropagation();   // block other capture handlers too
  }, { capture: true });

  // Use window for move/up so rotation keeps working even if pointer leaves canvas
  const onMove = (e: PointerEvent) => {
    if (!rotating || e.pointerId !== activePointer) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    // Drag right → rotate right (match mobile twist)
    this.rig.rotateBy(-dx * 0.008);
  };

  const onStop = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return;
    rotating = false;
    activePointer = -1;
    try { el.releasePointerCapture(e.pointerId); } catch {}
  };

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onStop);
  window.addEventListener("pointercancel", onStop);
}


private installRMBRotateViaPointer() {
  const el = this.renderer.domElement;
  // Disable context menu so RMB-drag is clean
  el.addEventListener("contextmenu", (e) => e.preventDefault());

  let rotating = false;
  let lastX = 0;
  let activePointer = -1;

  // Use capture so we run before Input's pointerdown and can stop it
  el.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" && e.button === 2) { // right button
      rotating = true;
      lastX = e.clientX;
      activePointer = e.pointerId;
      try { el.setPointerCapture(e.pointerId); } catch {}
      e.preventDefault();
      e.stopImmediatePropagation(); // don’t let Input handle this RMB press
    }
  }, { capture: true });

  el.addEventListener("pointermove", (e) => {
    if (!rotating || e.pointerId !== activePointer) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    // drag right → rotate right
    this.rig.rotateBy(-dx * 0.008);
  });

  const stop = (e: PointerEvent) => {
    if (e.pointerId !== activePointer) return;
    rotating = false;
    activePointer = -1;
    try { el.releasePointerCapture(e.pointerId); } catch {}
  };
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointercancel", stop);
  el.addEventListener("pointerleave", () => { rotating = false; activePointer = -1; });
}




// src/core/App.ts  (inside class App)
private onSingleMove(sx: number, sy: number) {
  if (this.tool.kind === "place") {
    this.updatePlacePreviewFromScreen(sx, sy);
    return;
  }
  if (!this.lastTile || this.twoFingerActive) return;

  const tile = this.screenToTile(sx, sy);
  if (!tile) return;

  // If we had a deferred first dab, cancel the timer and paint now.
  if (this.pendingPaintTimeout !== null) {
    this.cancelPendingPaint();
  }

  let zone: ZoneId;
  if (this.tool.kind === "erase") zone = ZoneId.Empty;
  else if (this.tool.kind === "paint") zone = this.tool.zone;
  else zone = ZoneId.Residential;

  this.paint.strokeLine(this.lastTile.x, this.lastTile.y, tile.x, tile.y, zone);
  this.lastTile = tile;
}


private onSingleEnd() {
  this.cancelPendingPaint();
  this.lastTile = null;
}

private onDualStart() {
  this.twoFingerActive = true;
  this.cancelPendingPaint(); // kill any deferred first dab
  this.lastTile = null;
}

private onDualEnd() {
  this.twoFingerActive = false;
  this._prevDual = null; // keep your existing pinch-zoom/twist state reset
}

  // Two-finger: pan + pinch + twist rotate
  private _prevDual: { cx: number; cy: number; d: number; a: number } | null = null;
private onDualMove(x1: number, y1: number, x2: number, y2: number) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const d  = Math.hypot(x2 - x1, y2 - y1);
  const a  = Math.atan2(y2 - y1, x2 - x1);

  if (!this._prevDual) { this._prevDual = { cx, cy, d, a }; return; }

  const dx = cx - this._prevDual.cx;
  const dy = cy - this._prevDual.cy;
  const scale = d / this._prevDual.d || 1;

  // Pan
  this.rig.panByScreenDelta(dx, dy);

  // Zoom
  const zoomScale = Math.pow(1 / scale, 0.5);
  if (isFinite(zoomScale) && zoomScale > 0) this.rig.zoomBy(zoomScale);

  // Rotate (normalize to [-PI, PI]) and invert for natural twist
  let da = a - this._prevDual.a;
  if (da >  Math.PI) da -= Math.PI * 2;
  if (da < -Math.PI) da += Math.PI * 2;
  this.rig.rotateBy(-da);

  this._prevDual = { cx, cy, d, a };
}


  // Keyboard move/zoom (unchanged)
  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
    this.keys.add(e.code);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private keys = new Set<string>();
  private _lastTime: number | undefined;

private updateKeyboard(dt: number) {
  if (!this.keys || this.keys.size === 0) return;

  const basePxPerSec = 800;
  const fast = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
  const px = basePxPerSec * (fast ? 1.8 : 1.0) * dt;

  let dx = 0;
  let dy = 0;

  // Pan
  if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) dx += px;
  if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) dx -= px;
  if (this.keys.has("ArrowUp") || this.keys.has("KeyW")) dy += px;
  if (this.keys.has("ArrowDown") || this.keys.has("KeyS")) dy -= px;

  if (dx !== 0 || dy !== 0) {
    this.rig.panByScreenDelta(dx, dy);
  }

  // Zoom
  const zoomIn =
    this.keys.has("Equal") || this.keys.has("NumpadAdd");
  const zoomOut =
    this.keys.has("Minus") || this.keys.has("NumpadSubtract");

  if (zoomIn || zoomOut) {
    const perFrame = zoomIn ? 0.985 : 1.015;
    const scale = Math.pow(perFrame, dt * 60);
    this.rig.zoomBy(scale);
  }

  // ✅ Rotate with Q / E
  const rotateSpeed = dt * 2.5; // radians/sec
  if (this.keys.has("KeyQ")) this.rig.rotateBy(+rotateSpeed); // left
  if (this.keys.has("KeyE")) this.rig.rotateBy(-rotateSpeed); // right
}


  // Loop
  private animate = (time?: number) => {
    const now = time ?? performance.now();
    if (this._lastTime === undefined) this._lastTime = now;
    const dt = (now - this._lastTime) / 1000;
    this._lastTime = now;

    this.updateKeyboard(dt);
    this.resources.update(dt);
    this.jobs.update(dt);
    this.spawner.update(dt);

    this.renderer.render(this.scene, this.rig.camera);
    requestAnimationFrame(this.animate);
  };
}
