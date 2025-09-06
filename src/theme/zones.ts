// src/theme/zones.ts
import { ZoneId, ZoneRegistry } from "../types/types";

// Helper: convert hex to RGBA bytes with a glassy alpha by default
function hexToRGBA(hex: string, a = 72) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return { r, g, b, a }; // 0..255 each
}

/**
 * Frutiger Aero theme:
 * - Residential: glassy lime (vivid, slightly neon)
 * - Market: royal-aero blue (bright azure)
 * - Road: frosted silver
 * Tweak the alpha (a) if you want more/less glass.
 */
export const ZONES: ZoneRegistry = {
  [ZoneId.Empty]: {
    id: ZoneId.Empty,
    name: "None",
    color: { r: 0, g: 0, b: 0, a: 0 },
  },
  [ZoneId.Residential]: {
    id: ZoneId.Residential,
    name: "Residential",
    // Lime / Aero green
    color: hexToRGBA("#7CFF6B", 78),
  },
  [ZoneId.Market]: {
    id: ZoneId.Market,
    name: "Market",
    // Royal-aero blue (bright azure)
    color: hexToRGBA("#2F7BFF", 82),
  },
  [ZoneId.Road]: {
    id: ZoneId.Road,
    name: "Road",
    // Frosted silver
    color: hexToRGBA("#C9D6E8", 60),
  },
};
