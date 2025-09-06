// src/core/CameraRig.ts
import { PerspectiveCamera, Vector2, Vector3, MathUtils } from "three";

/**
 * CameraRig
 * - Perspective camera with yaw rotation (360°) and fixed pitch (slight tilt).
 * - Smooth world panning from screen deltas.
 * - Zoom by changing distance along view vector (clamped).
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;

  // Target the camera looks at (center of the map)
  private target = new Vector3(0, 0, 0);

  // Spherical-ish params
  private yaw = 0;                          // radians, 0 looks toward -Z
  private pitch = MathUtils.degToRad(55);   // keep a gentle top-down tilt
  private distance = 38;                    // world units from target

  // clamps
  private minDistance = 8;
  private maxDistance = 400;                // bumped so whole map fits easily

  // viewport
  private aspect = 9 / 16;
  private viewportHeightPx = 800;

  // scratch
  private _fwd = new Vector3();
  private _right = new Vector3();
  private _tmp = new Vector3();

  constructor(aspect: number) {
    this.aspect = aspect;

    // A small-ish vertical FOV to give an "orthographic-ish" feel
    this.camera = new PerspectiveCamera(40, this.aspect, 0.1, 2000);

    this.updateCameraTransform();
  }

  /** Optional helper to set max zoom based on world size (e.g., 128x128). */
  setWorldSize(width: number, height: number) {
    const diag = Math.hypot(width, height);
    // Very forgiving cap so the full world fits on tall phones even at steeper pitch.
    this.maxDistance = Math.max(this.maxDistance, diag * 2);
  }

  setAspect(a: number) {
    this.aspect = a;
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
    this.updateCameraTransform();
  }

  setViewportHeight(hPx: number) {
    this.viewportHeightPx = Math.max(1, hPx | 0);
  }

panByScreenDelta(dxPx: number, dyPx: number) {
  const metersPerPixel =
    (2 * Math.tan(MathUtils.degToRad(this.camera.fov * 0.5)) * this.distance) /
    this.viewportHeightPx;

  this.getGroundVectors(this._fwd, this._right);

  // Follow-the-finger: drag RIGHT → map moves RIGHT
  this.target
    .addScaledVector(this._right, +dxPx * metersPerPixel)  // ← + on X
    .addScaledVector(this._fwd,    +dyPx * metersPerPixel);

  this.updateCameraTransform();
}






  /** Zoom by scale ( <1 in, >1 out ) */
  zoomBy(scale: number) {
    this.distance = MathUtils.clamp(this.distance * scale, this.minDistance, this.maxDistance);
    this.updateCameraTransform();
  }

/** Rotate around the Y (up) axis by delta radians. */
rotateBy(deltaYawRad: number) {
  this.yaw = (this.yaw + deltaYawRad) % (Math.PI * 2);
  this.updateCameraTransform();
}



  /** Optionally let callers reset where the camera looks. */
  setTarget(x: number, y: number, z: number) {
    this.target.set(x, y, z);
    this.updateCameraTransform();
  }

  // --- helpers ---
// src/core/CameraRig.ts
private updateCameraTransform() {
  // We define pitch as a DOWNWARD tilt (0 = level, + = down).
  // Forward (camera → target) with yaw around +Y and pitch downward:
  //  x =  sin(yaw) * cos(pitch)
  //  y = -sin(pitch)
  //  z = -cos(yaw) * cos(pitch)     (yaw=0 looks toward -Z)
  const cy = Math.cos(this.yaw);
  const sy = Math.sin(this.yaw);
  const cp = Math.cos(this.pitch);
  const sp = Math.sin(this.pitch);

  const forward = this._tmp.set(
    sy * cp,   // x
    -sp,       // y (downward)
    -cy * cp   // z
  ).normalize();

  // Place camera behind the target along forward vector
  this.camera.position.copy(this.target).sub(forward.multiplyScalar(this.distance));
  this.camera.lookAt(this.target);
}


  /** Get ground-projected forward (toward camera.lookAt) and right vectors. */
  private getGroundVectors(outFwd: Vector3, outRight: Vector3) {
    // Forward is from camera toward target
    const forward = this._tmp.copy(this.target).sub(this.camera.position).normalize();
    // Project to XZ plane
    outFwd.set(forward.x, 0, forward.z).normalize();
    // Right is +90° around Y
    outRight.set(outFwd.z, 0, -outFwd.x).normalize();
  }
}
