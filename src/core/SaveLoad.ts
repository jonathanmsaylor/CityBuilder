import { Grid } from "./Grid";

function encode(arr: Uint8Array): string {
  // Simple base64 of raw bytes
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}
function decode(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export class SaveLoad {
  private grid: Grid;
  private key: string;

constructor(grid: Grid, placement?: any, key = "save_001") {
  this.grid = grid;
  this.key = key;
  (this as any)._placement = placement; // optional; used for buildings
}


save() {
  const placement = (this as any)._placement;
  const blob: any = {
    v: 2,
    w: this.grid.width,
    h: this.grid.height,
    zones: encode(this.grid.zoneMap),
    occ: encode(this.grid.occupancyMap),
    buildings: placement && placement.serialize ? placement.serialize() : [],
  };
  localStorage.setItem(this.key, JSON.stringify(blob));
}


load(): boolean {
  const raw = localStorage.getItem(this.key);
  if (!raw) return false;
  const blob = JSON.parse(raw);

  // Back-compat check
  if (blob.w !== this.grid.width || blob.h !== this.grid.height) return false;

  // Zones (required in both v1 & v2)
  if (blob.zones) {
    const zones = decode(blob.zones);
    this.grid.zoneMap.set(zones);
  }

  // Occupancy (v2). If missing, clear it.
  if (blob.occ) {
    const occ = decode(blob.occ);
    this.grid.occupancyMap.set(occ);
  } else {
    this.grid.occupancyMap.fill(0);
  }

  // Buildings (v2)
  const placement = (this as any)._placement;
  if (placement) {
    placement.clearAllBuildings();
    if (Array.isArray(blob.buildings)) {
      placement.load(blob.buildings);
    }
  }
  return true;
}

}
