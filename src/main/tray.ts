import { app, BrowserWindow, Menu, Tray, nativeImage } from "electron";
import path from "node:path";
import type { RiskStatus } from "../shared/types.js";

interface TrayActions {
  showMainWindow: () => void;
  hideToTray: () => void;
  quitApp: () => void;
}

const trayIconFiles: Record<RiskStatus, string> = {
  green: "tray-green.ico",
  yellow: "tray-yellow.ico",
  red: "tray-red.ico"
};

export function createStatusTray(window: BrowserWindow, status: RiskStatus, actions: TrayActions): Tray {
  const tray = new Tray(createTrayIcon(status));
  tray.setToolTip("VPN IP Guard");
  tray.setContextMenu(createTrayMenu(actions));
  tray.on("click", () => toggleWindow(window, actions));
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

function createTrayMenu(actions: TrayActions): Menu {
  return Menu.buildFromTemplate([
    {
      label: "显示主窗口",
      click: actions.showMainWindow
    },
    {
      label: "隐藏到托盘",
      click: actions.hideToTray
    },
    { type: "separator" },
    {
      label: "退出",
      click: actions.quitApp
    }
  ]);
}

function toggleWindow(window: BrowserWindow, actions: TrayActions): void {
  if (window.isVisible()) {
    actions.hideToTray();
    return;
  }
  actions.showMainWindow();
}

function createTrayIcon(status: RiskStatus): Electron.NativeImage {
  const iconPath = path.join(app.getAppPath(), "assets", trayIconFiles[status]);
  const image = nativeImage.createFromPath(iconPath);
  image.setTemplateImage(false);
  return image;
}
