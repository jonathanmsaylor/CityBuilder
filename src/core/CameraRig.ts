import { PerspectiveCamera, Vector3 } from "three";

export class CameraRig {
  camera: PerspectiveCamera;
  target = new Vector3(0, 0, 0);
  tiltDeg = 35;
  minDist = 8;
  maxDist = 45;
  dist = 24;
  fov = 35;

  private viewportH = 800; // updated by app on resize

  constructor(aspect = 9 / 16) {
    this.camera = new PerspectiveCamera(this.fov, aspect, 0.1, 1000);
    this.updateCamera();
  }

  setViewportHeight(h: number) {
    this.viewportH = h;
  }

  setAspect(a: number) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera() {
    const tilt = (this.tiltDeg * Math.PI) / 180;
    const y = Math.sin(tilt) * this.dist;
    const z = Math.cos(tilt) * this.dist;
    this.camera.position.set(this.target.x, y, this.target.z + z);
    this.camera.lookAt(this.target);
  }

  zoomBy(deltaScale: number) {
    this.dist *= deltaScale;
    this.dist = Math.max(this.minDist, Math.min(this.maxDist, this.dist));
    this.updateCamera();
  }

panByScreenDelta(dxPx: number, dyPx: number) {
  // Approximate meters per pixel at the ground plane
  const metersPerPx =
    (2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.dist) /
    this.viewportH;

  // Make content follow your finger in screen space:
  // dragging right → world moves right; dragging up → world moves up.
  this.target.x -= dxPx * metersPerPx;
  this.target.z -= dyPx * metersPerPx;

  this.updateCamera();
}

}
