// src/ui/hud.ts
// Compact HUD with collapse + zones visibility toggle
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
      <div class="row tools">
        <button id="paint-res" class="hud-btn">Res</button>
        <button id="paint-mkt" class="hud-btn">Mkt</button>
        <button id="paint-agr" class="hud-btn">Agri</button>
        <button id="erase"     class="hud-btn">Erase</button>
        <span class="sep"></span>
        <button id="place-farm" class="hud-btn">Farm</button>
        <span class="sep"></span>
        <button id="save" class="hud-btn">Save</button>
        <button id="load" class="hud-btn">Load</button>
        <span class="sep"></span>
        <button id="toggle-zones" class="hud-btn">Hide Zones</button>
      </div>

      <div class="row stats">
        <span id="rations" class="pill">Rations: 0.0</span>
        <span id="pop"     class="pill">Pop: 0</span>
        <span id="workers" class="pill">Workers: 0/0</span>
        <button id="hud-toggle" class="hud-fab" title="Collapse/Expand HUD">☰</button>
      </div>
    </div>
  `;

  // Restore collapsed state
  if (localStorage.getItem("hud_collapsed") === "1") {
    root.classList.add("collapsed");
  }

  // --- tool buttons ---
  (document.getElementById("paint-res") as HTMLButtonElement).onclick = () =>
    app.setTool({ kind: "paint", zone: ZoneId.Residential });
  (document.getElementById("paint-mkt") as HTMLButtonElement).onclick = () =>
    app.setTool({ kind: "paint", zone: ZoneId.Market });
  (document.getElementById("paint-agr") as HTMLButtonElement).onclick = () =>
    app.setTool({ kind: "paint", zone: ZoneId.Agriculture });
  (document.getElementById("erase") as HTMLButtonElement).onclick = () =>
    app.setTool({ kind: "erase" });

  (document.getElementById("place-farm") as HTMLButtonElement).onclick = () =>
    app.setTool({ kind: "place", id: "HydroponicsFarm" });

  (document.getElementById("save") as HTMLButtonElement).onclick = () => app.save();
  (document.getElementById("load") as HTMLButtonElement).onclick = () => app.load();

  // --- zones toggle button ---
  const zonesBtn = document.getElementById("toggle-zones") as HTMLButtonElement;
  const refreshZonesLabel = () => {
    zonesBtn.textContent = app.isOverlayVisible() ? "Hide Zones" : "Show Zones";
  };
  refreshZonesLabel();
  zonesBtn.onclick = () => {
    app.toggleOverlayVisible();     // toggles visibility
    refreshZonesLabel();            // update label
  };

  // --- collapse/expand HUD ---
  (document.getElementById("hud-toggle") as HTMLButtonElement).onclick = () => {
    root!.classList.toggle("collapsed");
    localStorage.setItem(
      "hud_collapsed",
      root!.classList.contains("collapsed") ? "1" : "0"
    );
  };

  // --- Throttled updater (every ~200ms) ---
  let last = 0;
  function tick(ts: number) {
    if (ts - last >= 200) {
      last = ts;
      (document.getElementById("rations")!).textContent =
        `Rations: ${app.getRations().toFixed(1)}`;
      (document.getElementById("pop")!).textContent =
        `Pop: ${app.getPopulation()}`;
      (document.getElementById("workers")!).textContent =
        `Workers: ${app.getWorkersAssigned()}/${app.getWorkersNeeded()}`;
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
