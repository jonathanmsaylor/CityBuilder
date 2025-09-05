import { App } from "./core/App";
import { createHUD } from "./ui/hud";
import "./ui/hud.css";

const root = document.getElementById("app")!;
const app = new App(root);

// HUD wiring
const hud = createHUD();
document.body.appendChild(hud.root);

hud.onSelectTool((tool) => app.setTool(tool));
hud.onBrushChange((r) => app.setBrushRadius(r));
hud.onSave(() => app.save());
hud.onLoad(() => app.load());
