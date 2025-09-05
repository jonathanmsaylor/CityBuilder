import { Tool, ZoneId } from "../types/types";

export function createHUD() {
  const root = document.createElement("div");
  root.className = "hud-root";

  const toolGroup = document.createElement("div");
  toolGroup.className = "tool-group";

  const btnRes = mkButton("Residential", "res");
  const btnMkt = mkButton("Market", "mkt");
  const btnRoad = mkButton("Road", "road");
  const btnErase = mkButton("Eraser", "eraser");

  toolGroup.append(btnRes, btnMkt, btnRoad, btnErase);

  const brushWrap = document.createElement("div");
  brushWrap.className = "brush-wrap";
  const brushLabel = document.createElement("label");
  brushLabel.textContent = "Brush";
  const brush = document.createElement("input");
  brush.type = "range";
  brush.min = "1";
  brush.max = "12";
  brush.value = "2";
  brushWrap.append(brushLabel, brush);

  const saveLoad = document.createElement("div");
  saveLoad.className = "save-load";
  const btnSave = mkButton("Save", "save");
  const btnLoad = mkButton("Load", "load");
  saveLoad.append(btnSave, btnLoad);

  root.append(toolGroup, brushWrap, saveLoad);

  let onTool = (t: Tool) => {};
  let onBrush = (r: number) => {};
  let onSave = () => {};
  let onLoad = () => {};

  btnRes.addEventListener("click", () => onTool({ kind: "paint", zone: ZoneId.Residential }));
  btnMkt.addEventListener("click", () => onTool({ kind: "paint", zone: ZoneId.Market }));
  btnRoad.addEventListener("click", () => onTool({ kind: "paint", zone: ZoneId.Road }));
  btnErase.addEventListener("click", () => onTool({ kind: "erase" }));

  brush.addEventListener("input", () => onBrush(parseInt(brush.value)));

  btnSave.addEventListener("click", () => onSave());
  btnLoad.addEventListener("click", () => onLoad());

  return {
    root,
    onSelectTool(fn: (t: Tool) => void) {
      onTool = fn;
    },
    onBrushChange(fn: (r: number) => void) {
      onBrush = fn;
    },
    onSave(fn: () => void) {
      onSave = fn;
    },
    onLoad(fn: () => void) {
      onLoad = fn;
    },
  };
}

function mkButton(label: string, key: string) {
  const b = document.createElement("button");
  b.className = "btn";
  b.dataset.key = key;
  b.textContent = label;
  return b;
}
