import { BrowserWindow, screen } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppConfig } from "../shared/types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createMainWindow(config: AppConfig): BrowserWindow {
  const window = new BrowserWindow({
    width: 380,
    height: 620,
    minWidth: 340,
    minHeight: 520,
    show: false,
    frame: false,
    resizable: true,
    alwaysOnTop: config.alwaysOnTop,
    skipTaskbar: false,
    title: "VPN IP Guard",
    backgroundColor: "#101318",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  positionBottomRight(window);

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
    window.webContents.once("did-finish-load", () => {
      window.webContents.openDevTools({ mode: "detach" });
    });
  } else {
    void window.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  window.once("ready-to-show", () => {
    positionBottomRight(window);
    window.show();
  });

  return window;
}

export function positionBottomRight(window: BrowserWindow): void {
  const display = screen.getPrimaryDisplay();
  const { width, height } = window.getBounds();
  const { x, y, width: workWidth, height: workHeight } = display.workArea;
  window.setPosition(x + workWidth - width - 18, y + workHeight - height - 18, false);
}
