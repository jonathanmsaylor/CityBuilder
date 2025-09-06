import { Color, Mesh, MeshStandardMaterial, BoxGeometry } from "three";
import { ZoneId } from "../types/types";

export type BuildingId = "ResidentialHut" | "MarketStall";

export interface BuildingBlueprint {
  id: BuildingId;
  name: string;
  // footprint in tiles (width x height)
  w: number;
  h: number;
  // tiles must be one of these zone IDs
  allowedZones: ZoneId[];
  // simple color for the mesh (placeholder art)
  color: number;
  // height in world units (visual only)
  height: number;
}

export const BUILDINGS: Record<BuildingId, BuildingBlueprint> = {
  ResidentialHut: {
    id: "ResidentialHut",
    name: "Hut",
    w: 2,
    h: 2,
    allowedZones: [ZoneId.Residential],
    color: 0xf4b183, // warm clay
    height: 1,
  },
  MarketStall: {
    id: "MarketStall",
    name: "Stall",
    w: 2,
    h: 2,
    allowedZones: [ZoneId.Market],
    color: 0x8ab4f8, // cool canvas
    height: 0.8,
  },
};

// tiny helper to make a simple placeholder mesh for a placed building
export function makeBuildingMesh(bp: BuildingBlueprint): Mesh {
  const geo = new BoxGeometry(bp.w, bp.height, bp.h);
  const mat = new MeshStandardMaterial({
    color: new Color(bp.color),
    roughness: 0.9,
    metalness: 0.0,
  });
  return new Mesh(geo, mat);
}
