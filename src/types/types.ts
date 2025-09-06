export enum ZoneId {
  Empty = 0,
  Residential = 1,
  Market = 2,
  Road = 3
}

export type Tool =
  | { kind: "paint"; zone: ZoneId }
  | { kind: "erase" }
  | { kind: "place"; id: "ResidentialHut" | "MarketStall" };


export interface ZoneDef {
  id: ZoneId;
  name: string;
  color: { r: number; g: number; b: number; a: number }; // 0..255, a = 0..255
  icon?: string;
}

export type ZoneRegistry = Record<number, ZoneDef>;

export interface PointerPoint {
  x: number; // screen x (CSS px)
  y: number; // screen y (CSS px)
  id: number; // pointerId
}
