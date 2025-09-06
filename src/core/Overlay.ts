import {
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  UnsignedByteType,
  ShaderMaterial,
  Vector2,
  RedFormat,
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
readonly idTexture: DataTexture;    // per-tile zone IDs
private idData: Uint8Array;

  private data: Uint8Array;

constructor(grid: Grid) {
  this.grid = grid;

  // Color DataTexture (RGBA) sized to grid
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

  // Zone-ID DataTexture (single channel) sized to grid
  this.idData = new Uint8Array(grid.width * grid.height); // 0..255 zone ids
  this.idTexture = new DataTexture(
    this.idData,
    grid.width,
    grid.height,
    RedFormat,
    UnsignedByteType
  );
  this.idTexture.magFilter = NearestFilter;
  this.idTexture.minFilter = NearestFilter;
  this.idTexture.needsUpdate = true;

  // Plane
  this.geometry = new PlaneGeometry(grid.width, grid.height, 1, 1);
  this.geometry.rotateX(-Math.PI / 2);

  // Glass + boundary glow shader
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      tMap:   { value: this.texture },                     // RGBA zone tint
      tZones: { value: this.idTexture },                   // single-channel zone IDs
      uGrid:  { value: new Vector2(grid.width, grid.height) },
      uTexel: { value: new Vector2(1 / grid.width, 1 / grid.height) },
      uResId: { value: 1.0 }, // ZoneId.Residential = 1 (float)
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      uniform sampler2D tMap;   // RGBA tint
      uniform sampler2D tZones; // R = zone id / 255
      uniform vec2 uGrid;
      uniform vec2 uTexel;
      uniform float uResId;

      varying vec2 vUv;

      // read residential mask at a UV
      float resMask(vec2 uv) {
        float id = floor(texture2D(tZones, uv).r * 255.0 + 0.5);
        // 1 when id == uResId, else 0
        return 1.0 - step(0.5, abs(id - uResId));
      }

      // local (0..1) coords in each tile
      vec2 tileUV(vec2 uv) { return fract(uv * uGrid); }

      // edge detector at a given pixel radius
      float edgeAt(vec2 uv, float r) {
        float c = resMask(uv);
        float e = 0.0;
        e = max(e, abs(c - resMask(uv + vec2( r * uTexel.x, 0.0))));
        e = max(e, abs(c - resMask(uv + vec2(-r * uTexel.x, 0.0))));
        e = max(e, abs(c - resMask(uv + vec2(0.0,  r * uTexel.y))));
        e = max(e, abs(c - resMask(uv + vec2(0.0, -r * uTexel.y))));
        // diagonals
        e = max(e, abs(c - resMask(uv + vec2( r * uTexel.x,  r * uTexel.y))));
        e = max(e, abs(c - resMask(uv + vec2(-r * uTexel.x,  r * uTexel.y))));
        e = max(e, abs(c - resMask(uv + vec2( r * uTexel.x, -r * uTexel.y))));
        e = max(e, abs(c - resMask(uv + vec2(-r * uTexel.x, -r * uTexel.y))));
        return e;
      }

      // screen-style blend
      vec3 screen(vec3 a, vec3 b) { return 1.0 - (1.0 - a) * (1.0 - b); }

      void main() {
        vec4 baseC = texture2D(tMap, vUv);   // 0..1
        vec3 base  = baseC.rgb;
        float aBase = baseC.a;

        // per-tile sheen (keep it subtle)
        vec2 tuv = tileUV(vUv);
        float h1 = smoothstep(0.65, 1.0, 1.0 - length(tuv - vec2(0.22, 0.20)));
        float h2 = smoothstep(0.75, 1.0, 1.0 - length(tuv - vec2(0.78, 0.84)));
        float sheen = h1 * 0.35 + h2 * 0.25;
        vec3 glassHL = vec3(0.90, 0.98, 1.00) * sheen;

        // residential boundary glow (lime), multi-radius for soft falloff
        float e1 = edgeAt(vUv, 1.0);
        float e2 = edgeAt(vUv, 2.0);
        float e3 = edgeAt(vUv, 3.0);
        float glow = clamp(e1 * 0.95 + e2 * 0.6 + e3 * 0.35, 0.0, 1.0);

        vec3 glowColor = vec3(0.55, 1.00, 0.45); // lime glow
        vec3 withGlass = mix(base, screen(base, glassHL), 0.55);
        vec3 withGlow  = mix(withGlass, glowColor, glow);

        // let glow show even outside the zone (like the screenshot)
        float aGlow = glow * 0.85;
        float aOut  = max(aBase, aGlow);

        if (aOut <= 0.001) discard;
        gl_FragColor = vec4(withGlow, aOut);
      }
    `,
  });

  // keep public type the same
  this.material = mat as unknown as MeshBasicMaterial;

  this.mesh = new Mesh(this.geometry, this.material);
  this.mesh.position.set(0, 0.01, 0);

  // Initialize texture buffers
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
  // tint color
// Optional: blend alpha based on distance for round fade
const r2 = zdef.color.r;
const g2 = zdef.color.g;
const b2 = zdef.color.b;

// Keep base alpha but scale by falloff
let a2 = zdef.color.a;

// Example: fade alpha near circle edges
// You’d pass in a “strength” when painting; here just use full a2
this.setPixel(x, y, r2, g2, b2, a2);
  // zone id (single channel)
  this.idData[y * this.grid.width + x] = zone;
}


refreshAll() {
  for (let y = 0; y < this.grid.height; y++) {
    for (let x = 0; x < this.grid.width; x++) {
      this.setTileFromZone(x, y, this.grid.getZone(x, y));
    }
  }
  this.texture.needsUpdate = true;
  this.idTexture.needsUpdate = true;
}


updateAfterPaint() {
  // We’re still pushing whole-texture updates (fast enough for 128×128).
  this.refreshAll();
}

}
