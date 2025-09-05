import { ZoneId, ZoneRegistry } from "../types/types";

function hexToRGBA(hex: string, a = 48) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return { r, g, b, a };
}

export const ZONES: ZoneRegistry = {
  [ZoneId.Empty]: {
    id: ZoneId.Empty,
    name: "None",
    color: { r: 0, g: 0, b: 0, a: 0 },
  },
  [ZoneId.Residential]: {
    id: ZoneId.Residential,
    name: "Residential",
    color: hexToRGBA("#34d399", 46), // emerald-ish
  },
  [ZoneId.Market]: {
    id: ZoneId.Market,
    name: "Market",
    color: hexToRGBA("#60a5fa", 50), // blue
  },
  [ZoneId.Road]: {
    id: ZoneId.Road,
    name: "Road",
    color: hexToRGBA("#a3a3a3", 60), // gray, slightly stronger
  },
};
