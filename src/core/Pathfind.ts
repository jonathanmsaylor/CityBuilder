// src/core/Pathfind.ts
// Tiny 4-neighbor A* over your tile grid using occupancyMap as walls.
// Designed to run infrequently (on assignment or when target changes).
export type Tile = { x: number; y: number };

export interface WalkGrid {
  width: number;
  height: number;
  inBounds(x: number, y: number): boolean;
  isBlocked(x: number, y: number): boolean;
}

function key(x: number, y: number) {
  return (y << 16) | x;
}

export function aStar(
  grid: WalkGrid,
  start: Tile,
  goal: Tile,
  maxExpanded = 4000
): Tile[] | null {
  if (!grid.inBounds(start.x, start.y) || !grid.inBounds(goal.x, goal.y)) return null;
  if (grid.isBlocked(start.x, start.y)) return null;

  const open: number[] = [];
  const g = new Map<number, number>();
  const came = new Map<number, number>();

  const startK = key(start.x, start.y);
  const goalK = key(goal.x, goal.y);

  g.set(startK, 0);
  open.push(startK);

  let expanded = 0;

  function h(x: number, y: number) {
    // Manhattan is fine (4-neighbor)
    return Math.abs(x - goal.x) + Math.abs(y - goal.y);
  }
  function fScore(k: number) {
    const x = k & 0xffff;
    const y = (k >>> 16) & 0xffff;
    return (g.get(k) ?? Infinity) + h(x, y);
  }

  while (open.length && expanded < maxExpanded) {
    // find lowest f (linear scan; low N)
    let bestIdx = 0;
    let bestF = Infinity;
    for (let i = 0; i < open.length; i++) {
      const fs = fScore(open[i]);
      if (fs < bestF) { bestF = fs; bestIdx = i; }
    }
    const current = open.splice(bestIdx, 1)[0];
    expanded++;

    if (current === goalK) {
      // reconstruct
      const path: Tile[] = [];
      let cur = current;
      while (cur !== startK) {
        const x = cur & 0xffff;
        const y = (cur >>> 16) & 0xffff;
        path.push({ x, y });
        const prev = came.get(cur)!;
        cur = prev;
      }
      path.push({ x: start.x, y: start.y });
      path.reverse();
      return path;
    }

    const cx = current & 0xffff;
    const cy = (current >>> 16) & 0xffff;
    const neighbors = [
      { x: cx + 1, y: cy },
      { x: cx - 1, y: cy },
      { x: cx, y: cy + 1 },
      { x: cx, y: cy - 1 },
    ];

    for (const n of neighbors) {
      if (!grid.inBounds(n.x, n.y)) continue;
      if (grid.isBlocked(n.x, n.y)) continue;

      const nk = key(n.x, n.y);
      const tentative = (g.get(current) ?? Infinity) + 1;

      if (tentative < (g.get(nk) ?? Infinity)) {
        came.set(nk, current);
        g.set(nk, tentative);
        if (!open.includes(nk)) open.push(nk);
      }
    }
  }
  return null;
}
