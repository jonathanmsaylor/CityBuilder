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

  constructor(grid: Grid, key = "save_001") {
    this.grid = grid;
    this.key = key;
  }

  save() {
    const blob = {
      w: this.grid.width,
      h: this.grid.height,
      zones: encode(this.grid.zoneMap),
    };
    localStorage.setItem(this.key, JSON.stringify(blob));
  }

  load(): boolean {
    const raw = localStorage.getItem(this.key);
    if (!raw) return false;
    const blob = JSON.parse(raw);
    if (blob.w !== this.grid.width || blob.h !== this.grid.height) return false;
    const arr = decode(blob.zones);
    this.grid.zoneMap.set(arr);
    return true;
  }
}
