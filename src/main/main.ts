import { app, BrowserWindow, ipcMain, Tray } from "electron";
import { getConfig, updateConfig } from "./config.js";
import { IpMonitor } from "./ipMonitor.js";
import { createStatusTray, updateTrayStatus } from "./tray.js";
import { createMainWindow, positionBottomRight } from "./window.js";
import type { AppConfig, MonitorSnapshot } from "../shared/types.js";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let monitor: IpMonitor | null = null;
let isQuitting = false;

app.setName("VPN IP Guard");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow) {
    return;
  }
  mainWindow.show();
  mainWindow.focus();
  positionBottomRight(mainWindow);
});

app.whenReady().then(() => {
  const config = getConfig();
  mainWindow = createMainWindow(config);
  const window = mainWindow;
  tray = createStatusTray(window, "green");
  monitor = new IpMonitor(getConfig, updateConfig);

  wireIpc();

  monitor.on("snapshot", (snapshot: MonitorSnapshot) => {
    window.webContents.send("snapshot", snapshot);
    updateTrayStatus(tray, snapshot.metrics.status);
  });

  window.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    window.hide();
  });

  monitor.start();
});

app.on("before-quit", () => {
  isQuitting = true;
  monitor?.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function wireIpc(): void {
  ipcMain.handle("get-snapshot", () => monitor?.getSnapshot());

  ipcMain.handle("run-check-now", async () => {
    return monitor?.checkNow();
  });

  ipcMain.handle("reset-and-check-now", async () => {
    return monitor?.resetAndCheckNow();
  });

  ipcMain.handle("update-config", (_event, patch: Partial<AppConfig>) => {
    const nextConfig = updateConfig(patch);
    mainWindow?.setAlwaysOnTop(nextConfig.alwaysOnTop);
    return monitor?.recalculate();
  });

  ipcMain.handle("hide-to-tray", () => {
    mainWindow?.hide();
  });
}
