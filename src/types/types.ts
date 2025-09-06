// src/types/types.ts

// Zones
export enum ZoneId {
  Empty = 0,
  Residential = 1,
  Market = 2,
  Road = 3,
  Agriculture = 4,
}

// UI/Tool unions (kept intentionally simple)
export type Tool =
  | { kind: "paint"; zone: ZoneId }
  | { kind: "erase" }
  | { kind: "place"; id: any }; // BuildingId is declared in core; avoid circular dep

// Theme registry typing
export type ZoneRegistry = Record<
  ZoneId,
  {
    id: ZoneId;
    name: string;
    color: { r: number; g: number; b: number; a: number };
  }
>;
