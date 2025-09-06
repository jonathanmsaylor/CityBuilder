// src/theme/zones.ts
import { ZoneId, ZoneRegistry } from "../types/types";

// Return byte RGBA
function hexToRGBA(hex: string, a = 96) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return { r, g, b, a };
}

// Simple, slightly transparent tints (no special effects)
export const ZONES: ZoneRegistry = {
  [ZoneId.Empty]: {
    id: ZoneId.Empty,
    name: "None",
    color: { r: 0, g: 0, b: 0, a: 0 },
  },
  [ZoneId.Residential]: {
    id: ZoneId.Residential,
    name: "Residential",
    color: hexToRGBA("#7CFF6B", 96), // lime green ~38% opacity
  },
  [ZoneId.Market]: {
    id: ZoneId.Market,
    name: "Market",
    color: hexToRGBA("#2F7BFF", 96), // royal/azure blue ~38% opacity
  },
  [ZoneId.Road]: {
    id: ZoneId.Road,
    name: "Road",
    color: hexToRGBA("#A3A3A3", 64), // gentle gray
  },
};
