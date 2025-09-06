// src/ui/hud.ts
import { App } from "../core/App";
import { ZoneId } from "../types/types";

export function initHUD(app: App) {
  let root = document.getElementById("hud");
  if (!root) {
    root = document.createElement("div");
    root.id = "hud";
    document.body.appendChild(root);
  }
  root.className = "hud";

  root.innerHTML = `
    <div class="bar">
      <button id="paint-res">Res</button>
      <button id="paint-mkt">Mkt</button>
      <button id="paint-agr">Agri</button>
      <button id="erase">Erase</button>
      <span class="sep"></span>
      <button id="place-farm">Farm</button>
      <span class="sep"></span>
      <button id="save">Save</button>
      <button id="load">Load</button>
    </div>
    <div class="stats">
      <span id="rations">Rations: 0.0</span>
      <span id="pop">Pop: 0</span>
    </div>
  `;

  (document.getElementById("paint-res")!).onclick = () =>
    app.setTool({ kind: "paint", zone: ZoneId.Residential });
  (document.getElementById("paint-mkt")!).onclick = () =>
    app.setTool({ kind: "paint", zone: ZoneId.Market });
  (document.getElementById("paint-agr")!).onclick = () =>
    app.setTool({ kind: "paint", zone: ZoneId.Agriculture });
  (document.getElementById("erase")!).onclick = () =>
    app.setTool({ kind: "erase" });

  (document.getElementById("place-farm")!).onclick = () =>
    app.setTool({ kind: "place", id: "HydroponicsFarm" });

  (document.getElementById("save")!).onclick = () => app.save();
  (document.getElementById("load")!).onclick = () => app.load();

  // Throttled updater (every ~200ms)
  let acc = 0;
  function tick(time: number) {
    acc += 16;
    if (acc >= 200) {
      acc = 0;
      const r = document.getElementById("rations")!;
      const p = document.getElementById("pop")!;
      r.textContent = `Rations: ${app.getRations().toFixed(1)}`;
      p.textContent = `Pop: ${app.getPopulation()}`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
