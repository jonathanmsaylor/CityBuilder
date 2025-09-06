// src/core/Jobs.ts
import {
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  Scene,
  Vector3,
} from "three";
import { Grid } from "./Grid";
import { Placement } from "./Placement";
import { Resources } from "./Resources";
import { BUILDINGS, BuildingId } from "./Buildings";
import { aStar, Tile } from "./Pathfind";

type AgentState = "idle" | "toWork" | "working" | "toHome";
type Agent = {
  id: number;
  mesh: Mesh;
  tile: Tile;           // current tile (rounded)
  pos: Vector3;         // world position (smooth)
  speed: number;        // tiles/sec
  state: AgentState;
  target?: Tile;        // current target tile
  path: Tile[];         // current path
  pathIdx: number;      // current waypoint index
  workTimer: number;    // seconds spent working at farm
  homeTile?: Tile;      // optional: tile to return to (near huts)
  farmKey?: string;     // which farm this agent serves
};

type FarmInfo = {
  id: string;             // unique key: `${tx},${ty},${w},${h}`
  tx: number; ty: number; // footprint origin
  w: number;  h: number;
  entry: Tile | null;     // a walkable tile adjacent to farm (cached)
  workerId?: number;      // assigned agent id
};

export class Jobs {
  private agents: Agent[] = [];
  private nextId = 1;
  private farmMap = new Map<string, FarmInfo>();
  private workerAssigned = 0;
  private workerNeeded = 0;

  // tuning
  private readonly WORK_RATE = 0.2; // rations/sec per staffed farm (same as Sprint A)
  private readonly WORK_CYCLE = 6.0; // seconds working before returning home
  private readonly AGENT_SPEED = 3.2; // tiles/sec

  private sphere?: SphereGeometry;
  private mat?: MeshStandardMaterial;

  constructor(
    private grid: Grid,
    private placement: Placement,
    private resources: Resources,
    private scene: Scene
  ) {}

  getWorkersAssigned() { return this.workerAssigned; }
  getWorkersNeeded() { return this.workerNeeded; }

  /** Call from App.animate */
  update(dt: number) {
    // Rebuild farm list each tick (cheap; small N)
    this.refreshFarms();

    // How many workers do we want? 1 per farm, capped by population.
    this.workerNeeded = this.farmMap.size;
    const pop = this.resources.getPopulation();
    const targetWorkers = Math.min(this.workerNeeded, Math.floor(pop));

    // Ensure we have exactly targetWorkers agents assigned.
    this.ensureAgents(targetWorkers);

    // Assign unassigned agents to unfilled farms.
    this.assignAgentsToFarms();

    // Step agent movement/work; accumulate production while working.
    this.simulateAgents(dt);
  }

  // -- internal --

  private refreshFarms() {
    this.farmMap.clear();
    const list = this.placement.serialize();
    for (const b of list) {
      if (b.id !== "HydroponicsFarm") continue;
      const key = `${b.tx},${b.ty},${b.w},${b.h}`;
      const info: FarmInfo = {
        id: key,
        tx: b.tx, ty: b.ty, w: b.w, h: b.h,
        entry: this.findAdjacentEntry(b.tx, b.ty, b.w, b.h),
        workerId: undefined,
      };
      this.farmMap.set(key, info);
    }
  }

  private ensureAgents(n: number) {
    // shrink
    while (this.agents.length > n) {
      const a = this.agents.pop()!;
      // free farm assignment if any
      if (a.farmKey) {
        const f = this.farmMap.get(a.farmKey);
        if (f && f.workerId === a.id) f.workerId = undefined;
      }
      this.scene.remove(a.mesh);
      (a.mesh.geometry as any)?.dispose?.();
      (a.mesh.material as any)?.dispose?.();
    }
    // grow
    while (this.agents.length < n) {
      const a = this.spawnAgent();
      this.agents.push(a);
    }
    this.workerAssigned = this.agents.length;
  }

  private spawnAgent(): Agent {
    if (!this.sphere) this.sphere = new SphereGeometry(0.25, 12, 12);
    if (!this.mat) this.mat = new MeshStandardMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.6 });

    const mesh = new Mesh(this.sphere, this.mat);
    mesh.position.set(0, 0.25, 0);
    this.scene.add(mesh);

    const startTile = this.findAnyWalkableNearHuts() ?? { x: 0, y: 0 };
    const startPos = this.grid.tileCenterToWorld(startTile.x, startTile.y);
    mesh.position.set(startPos.x, 0.25, startPos.z);

    const agent: Agent = {
      id: this.nextId++,
      mesh,
      tile: { ...startTile },
      pos: new Vector3(startPos.x, 0.25, startPos.z),
      speed: this.AGENT_SPEED,
      state: "idle",
      path: [],
      pathIdx: 0,
      workTimer: 0,
      homeTile: startTile,
    };
    return agent;
  }

  private assignAgentsToFarms() {
    // Build set of farms needing workers
    const need: FarmInfo[] = [];
    for (const f of this.farmMap.values()) {
      if (!f.entry) continue; // unreachable
      if (f.workerId === undefined) need.push(f);
    }

    // Unassigned agents → assign to needed farms
    for (const a of this.agents) {
      if (a.farmKey) continue; // already assigned
      const f = need.pop();
      if (!f) break;
      f.workerId = a.id;
      a.farmKey = f.id;
      // Route agent to farm entry
      if (f.entry) {
        a.target = { ...f.entry };
        a.path = this.findPath(a.tile, a.target) ?? [];
        a.pathIdx = 0;
        a.state = a.path.length ? "toWork" : "working"; // if already at entry
        a.workTimer = 0;
      } else {
        a.state = "idle";
      }
    }

    // If some agents lost their farm (farm destroyed), clear them.
    for (const a of this.agents) {
      if (!a.farmKey) continue;
      if (!this.farmMap.has(a.farmKey)) {
        a.farmKey = undefined;
        a.state = "idle";
        a.path = [];
      }
    }
  }

  private simulateAgents(dt: number) {
    for (const a of this.agents) {
      switch (a.state) {
        case "toWork": {
          this.stepMovement(a, dt);
          // reached?
          if (a.pathIdx >= a.path.length) {
            a.state = "working";
            a.workTimer = 0;
          }
          break;
        }
        case "working": {
          // produce while working
          this.resources.addRations(this.WORK_RATE * dt);
          a.workTimer += dt;
          if (a.workTimer >= this.WORK_CYCLE) {
            // go home (near huts)
            const home = a.homeTile ?? this.findAnyWalkableNearHuts();
            if (home) {
              a.target = { ...home };
              a.path = this.findPath(a.tile, home) ?? [];
              a.pathIdx = 0;
              a.state = "toHome";
            } else {
              // loop at farm if no home
              a.workTimer = 0;
            }
          }
          break;
        }
        case "toHome": {
          this.stepMovement(a, dt);
          if (a.pathIdx >= a.path.length) {
            // loop back to farm
            const f = a.farmKey ? this.farmMap.get(a.farmKey) : undefined;
            if (f?.entry) {
              a.target = { ...f.entry };
              a.path = this.findPath(a.tile, a.target) ?? [];
              a.pathIdx = 0;
              a.state = "toWork";
            } else {
              a.state = "idle";
            }
          }
          break;
        }
        case "idle": {
          // light idle bob or drift? keep still for now
          break;
        }
      }
    }
  }

  private stepMovement(a: Agent, dt: number) {
    if (!a.path.length) return;

    // current waypoint target (tile center)
    const idx = Math.min(a.pathIdx, a.path.length - 1);
    const t = a.path[idx];
    const wp = this.grid.tileCenterToWorld(t.x, t.y);
    const dest = new Vector3(wp.x, 0.25, wp.z);

    const dir = dest.clone().sub(a.pos);
    const dist = dir.length();
    const maxStep = a.speed * dt; // tiles/sec but our world units == tiles
    if (dist <= maxStep) {
      // arrive at waypoint
      a.pos.copy(dest);
      a.mesh.position.copy(dest);
      a.tile = { x: t.x, y: t.y };
      a.pathIdx++;
    } else {
      dir.normalize().multiplyScalar(maxStep);
      a.pos.add(dir);
      a.mesh.position.copy(a.pos);
      // update rough tile
      const tt = this.grid.worldToTile(a.pos.x, a.pos.z);
      a.tile = tt ?? a.tile;
    }
  }

  // --- helpers ---

  private findPath(from: Tile, to: Tile): Tile[] | null {
    const self = this;
    const wg = {
      width: this.grid.width,
      height: this.grid.height,
      inBounds(x: number, y: number) { return self.grid.inBounds(x, y); },
      isBlocked(x: number, y: number) {
        // treat occupancy > 0 as blocked
        const idx = self.grid.idx(x, y);
        return self.grid.occupancyMap[idx] !== 0;
      }
    };
    return aStar(wg, from, to);
  }

  private findAdjacentEntry(tx: number, ty: number, w: number, h: number): Tile | null {
    // find first walkable tile around the rectangle [tx..tx+w-1] × [ty..ty+h-1]
    const cand: Tile[] = [];
    for (let x = tx; x < tx + w; x++) {
      cand.push({ x, y: ty - 1 });
      cand.push({ x, y: ty + h });
    }
    for (let y = ty; y < ty + h; y++) {
      cand.push({ x: tx - 1, y });
      cand.push({ x: tx + w, y });
    }
    for (const c of cand) {
      if (this.grid.inBounds(c.x, c.y) && this.grid.occupancyMap[this.grid.idx(c.x, c.y)] === 0) {
        return c;
      }
    }
    return null;
  }

  private findAnyWalkableNearHuts(): Tile | null {
    // pick a walkable tile adjacent to any ResidentialHut footprint; else first free tile
    const list = this.placement.serialize();
    for (const b of list) {
      if (b.id !== "ResidentialHut") continue;
      const t = this.findAdjacentEntry(b.tx, b.ty, b.w, b.h);
      if (t) return t;
    }
    // fallback: scan a small area near origin
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        if (this.grid.occupancyMap[this.grid.idx(x, y)] === 0) return { x, y };
      }
    }
    return null;
  }
}
