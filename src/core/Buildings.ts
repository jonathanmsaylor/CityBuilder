// src/core/Buildings.ts
import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { ZoneId } from "../types/types";

export type BuildingId = "ResidentialHut" | "MarketStall" | "HydroponicsFarm";

export interface BuildingBlueprint {
  id: BuildingId;
  w: number;         // footprint in tiles (width)
  h: number;         // footprint in tiles (height)
  height: number;    // visual height (world units)
  allowedZones: ZoneId[];
  color: number;     // mesh tint for quick visual
}

export const BUILDINGS: Record<BuildingId, BuildingBlueprint> = {
  ResidentialHut: {
    id: "ResidentialHut",
    w: 2, h: 2,
    height: 1.6,
    allowedZones: [ZoneId.Residential],
    color: 0x8fd17d,
  },
  MarketStall: {
    id: "MarketStall",
    w: 2, h: 1,
    height: 1.2,
    allowedZones: [ZoneId.Market],
    color: 0xd0a85f,
  },
  HydroponicsFarm: {
    id: "HydroponicsFarm",
    w: 3, h: 3,
    height: 1.2,
    allowedZones: [ZoneId.Agriculture], // enforce Agri zone
    color: 0x22d1ff, // sci-fi cyan
  },
};

/** Simple box mesh placeholder for all buildings (fast + readable). */
export function makeBuildingMesh(bp: BuildingBlueprint): Mesh {
  const geom = new BoxGeometry(bp.w, bp.height, bp.h);
  const mat = new MeshStandardMaterial({ color: bp.color, roughness: 0.8, metalness: 0.05 });
  const mesh = new Mesh(geom, mat);
  // footprint center to world: App/Placement handles position; we just tag data.
  return mesh;
}
