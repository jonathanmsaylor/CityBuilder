// src/core/Spawner.ts
import { Grid } from "./Grid";
import { Placement } from "./Placement";
import { ZoneId } from "../types/types";
import { BUILDINGS, BuildingId } from "./Buildings";
import { Resources } from "./Resources";

type Job = {
  x0: number; y0: number; x1: number; y1: number;
  idleTicks: number; // consecutive ticks with no placement
};

export class Spawner {
  private queue: Job[] = [];
  private timer = 0;

  /** Seconds between spawn attempts (1 placement max per tick). */
  interval = 1.2;

  /** Random candidates tried per tick. Raise for faster fill on big patches. */
  attemptsPerTick = 64;

  /** Padding (tiles) so buildings never touch (diagonals included). */
  padding = 1;

  /** After this many empty ticks, we consider the rect "full" and retire it. */
  maxIdleTicks = 12;

  /** Which building to spawn for each zone ID. */
// src/core/Spawner.ts
private zoneToBuilding: Record<number, BuildingId | null> = {
  [ZoneId.Empty]: null,
  [ZoneId.Residential]: "ResidentialHut",
  [ZoneId.Market]: null,       // was "MarketStall" → disable auto-spawn for now
  [ZoneId.Road]: null,
  [ZoneId.Agriculture]: null,  // farms are placed by you, not auto
};


  constructor(
    private grid: Grid,
    private placement: Placement,
    private resources?: Resources, // optional gate
  ) {}

  /** Merge a new rect into the queue; keep it alive until it’s truly full. */
  enqueueRect(x0: number, y0: number, x1: number, y1: number) {
    const w = this.grid.width, h = this.grid.height;
    x0 = Math.max(0, Math.min(w - 1, Math.min(x0, x1)));
    y0 = Math.max(0, Math.min(h - 1, Math.min(y0, y1)));
    x1 = Math.max(0, Math.min(w - 1, Math.max(x0, x1)));
    y1 = Math.max(0, Math.min(h - 1, Math.max(y0, y1)));

    for (const j of this.queue) {
      const ox0 = Math.max(j.x0, x0), oy0 = Math.max(j.y0, y0);
      const ox1 = Math.min(j.x1, x1), oy1 = Math.min(j.y1, y1);
      if (ox0 <= ox1 && oy0 <= oy1) {
        j.x0 = Math.min(j.x0, x0);
        j.y0 = Math.min(j.y0, y0);
        j.x1 = Math.max(j.x1, x1);
        j.y1 = Math.max(j.y1, y1);
        j.idleTicks = 0;
        return;
      }
    }

    this.queue.push({ x0, y0, x1, y1, idleTicks: 0 });
  }

  /** Tick: attempt one placement somewhere in the oldest job, then re-enqueue it. */
// src/core/Spawner.ts
update(dt: number) {
  this.timer += dt;
  if (this.timer < this.interval) return;
  this.timer = 0;

  if (this.queue.length === 0) return;
  const job = this.queue.shift()!;

  let placed = false;
  let gated = false;

  for (let i = 0; i < this.attemptsPerTick; i++) {
    const tx = (Math.random() * (job.x1 - job.x0 + 1) + job.x0) | 0;
    const ty = (Math.random() * (job.y1 - job.y0 + 1) + job.y0) | 0;

    const zid = this.grid.getZone(tx, ty);
    const bId = this.zoneToBuilding[zid];
    if (!bId) continue;

    // 🔸 If hut is blocked by the food gate, don't penalize this job.
    if (bId === "ResidentialHut" && this.resources && !this.resources.canSpawnNewHut()) {
      gated = true;
      break; // stop trying for now; requeue intact
    }

    const bp = BUILDINGS[bId];
    const ox = tx - (bp.w >> 1);
    const oy = ty - (bp.h >> 1);

    if (!this.placement.canPlaceWithPadding(bId, ox, oy, this.padding)) continue;

    if (this.placement.tryPlace(bId, ox, oy)) {
      placed = true;
      break; // one placement per tick
    }
  }

  if (gated) {
    // Resource gate: keep the job alive with no idle penalty
    this.queue.push(job);
    return;
  }

  if (placed) {
    job.idleTicks = 0;
    this.queue.push(job);
  } else {
    job.idleTicks++;
    if (job.idleTicks < this.maxIdleTicks) this.queue.push(job);
    // else: truly full → retire
  }
}

}
