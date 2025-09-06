// src/core/Resources.ts
import { Placement } from "./Placement";

/**
 * Sprint A: minimal resource loop (Rations) + population derived from huts.
 * - Rations increase from HydroponicsFarm producers.
 * - Rations decrease from population consumption.
 * - Exposes a gate to allow/deny new ResidentialHut spawns.
 * - Saves/loads rations to LocalStorage (separate key), population re-derived from buildings.
 */
export class Resources {
  // Tunables (feel free to tweak)
  private readonly CONSUMPTION_PER_PERSON = 0.02; // rations per second
  private readonly FARM_RATE = 0.2;               // rations per second per HydroponicsFarm
  private readonly HUT_CAPACITY = 2;              // people per ResidentialHut
  private readonly IMMIGRATION_RESERVE_SECS = 30; // keep 30s buffer when adding 1 hut

  private readonly SAVE_KEY = "save_001_resources_v1";

  private rations = 0;      // live count (float)
  private population = 0;   // derived from huts count

  constructor(private placement: Placement) {}

  /** Call once per frame from App. */
  update(dt: number) {
    // 1) Derive counts from placed buildings
    let huts = 0;
    let farms = 0;
    const list = this.placement.serialize(); // { id, tx, ty, w, h }
    for (const b of list) {
      if (b.id === "ResidentialHut") huts++;
      else if (b.id === "HydroponicsFarm") farms++;
    }
    this.population = huts * this.HUT_CAPACITY;

    // 2) Production and consumption
    const produced = farms * this.FARM_RATE * dt;
    const consumed = this.population * this.CONSUMPTION_PER_PERSON * dt;
    this.rations += produced - consumed;

    if (this.rations < 0) this.rations = 0;
  }

  /** Gate: can we afford to spawn one new hut (i.e., +2 pop) without crashing food? */
  canSpawnNewHut(): boolean {
    const futurePop = this.population + this.HUT_CAPACITY;
    const reserve = futurePop * this.CONSUMPTION_PER_PERSON * this.IMMIGRATION_RESERVE_SECS;
    const MIN_STOCK = 10; // keep a floor
    return this.rations >= MIN_STOCK && (this.rations - reserve) >= 0;
  }

  // --- HUD getters ---
  getRations(): number { return this.rations; }
  getPopulation(): number { return this.population; }

  // --- Save/Load ---
  save() {
    try {
      localStorage.setItem(this.SAVE_KEY, JSON.stringify({ rations: this.rations }));
    } catch {}
  }

  load() {
    try {
      const raw = localStorage.getItem(this.SAVE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (typeof obj?.rations === "number") {
        this.rations = Math.max(0, obj.rations);
      }
    } catch {}
  }
}
