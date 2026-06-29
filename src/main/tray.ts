import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import path from "node:path";
import type { RiskStatus } from "../shared/types.js";

const trayIconFiles: Record<RiskStatus, string> = {
  green: "tray-green.ico",
  yellow: "tray-yellow.ico",
  red: "tray-red.ico"
};

export function createStatusTray(window: BrowserWindow, status: RiskStatus): Tray {
  const tray = new Tray(createTrayIcon(status));
  tray.setToolTip("VPN IP Guard");
  tray.setContextMenu(createTrayMenu(window));
  tray.on("click", () => toggleWindow(window));
  return tray;
}

export function updateTrayStatus(tray: Tray | null, status: RiskStatus): void {
  if (!tray) {
    return;
  }
  tray.setImage(nativeImage.createEmpty());
  tray.setImage(createTrayIcon(status));
  tray.setToolTip(`VPN IP Guard: ${status.toUpperCase()}`);
}

function createTrayMenu(window: BrowserWindow): Menu {
  return Menu.buildFromTemplate([
    {
      label: "Show",
      click: () => {
        window.show();
        window.focus();
      }
    },
    {
      label: "Hide to tray",
      click: () => window.hide()
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        window.destroy();
        process.exit(0);
      }
    }
  ]);
}

function toggleWindow(window: BrowserWindow): void {
  if (window.isVisible()) {
    window.hide();
    return;
  }
  window.show();
  window.focus();
}

function createTrayIcon(status: RiskStatus): Electron.NativeImage {
  const iconPath = path.join(app.getAppPath(), "assets", trayIconFiles[status]);
  const image = nativeImage.createFromPath(iconPath);
  image.setTemplateImage(false);
  return image;
}
