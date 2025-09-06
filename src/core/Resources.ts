// src/core/Resources.ts
// UPDATED: production removed (moved to Jobs). Consumption + save/load remain.
// Added addRations(delta) for Jobs to credit production.
import { Placement } from "./Placement";

export class Resources {
  private readonly CONSUMPTION_PER_PERSON = 0.02; // rations per second
  private readonly HUT_CAPACITY = 2;
  private readonly IMMIGRATION_RESERVE_SECS = 30;
  private readonly SAVE_KEY = "save_001_resources_v1";

  private rations = 0;
  private population = 0;

  constructor(private placement: Placement) {}

  update(dt: number) {
    // derive pop from huts
    let huts = 0;
    const list = this.placement.serialize();
    for (const b of list) if (b.id === "ResidentialHut") huts++;
    this.population = huts * this.HUT_CAPACITY;

    // only consumption here; production credited by Jobs
    const consumed = this.population * this.CONSUMPTION_PER_PERSON * dt;
    this.rations -= consumed;
    if (this.rations < 0) this.rations = 0;
  }

  addRations(delta: number) {
    this.rations += delta;
    if (this.rations < 0) this.rations = 0;
  }

// src/core/Resources.ts
canSpawnNewHut(): boolean {
  // Bootstrap: allow the very first hut even with zero food.
  // This breaks the deadlock so workers can staff farms and start production.
  if (this.getPopulation() === 0) return true;

  const futurePop = this.population + this.HUT_CAPACITY;
  const reserve = futurePop * this.CONSUMPTION_PER_PERSON * this.IMMIGRATION_RESERVE_SECS;
  const MIN_STOCK = 3;
  return this.rations >= MIN_STOCK && (this.rations - reserve) >= 0;
}


  getRations() { return this.rations; }
  getPopulation() { return this.population; }

  save() {
    try { localStorage.setItem(this.SAVE_KEY, JSON.stringify({ rations: this.rations })); } catch {}
  }
  load() {
    try {
      const raw = localStorage.getItem(this.SAVE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (typeof obj?.rations === "number") this.rations = Math.max(0, obj.rations);
    } catch {}
  }
}
