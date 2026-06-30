import { app, BrowserWindow, ipcMain, Menu, Notification, Tray } from "electron";
import { getConfig, updateConfig } from "./config.js";
import { IpMonitor } from "./ipMonitor.js";
import { createStatusTray, updateTrayStatus } from "./tray.js";
import { createMainWindow, createMiniStatusWindow, positionBottomRight } from "./window.js";
import { classifyDisplayStatus } from "../shared/displayStatus.js";
import type { AppConfig, DisplayStatus, MonitorSnapshot, NotificationMode } from "../shared/types.js";

let mainWindow: BrowserWindow | null = null;
let miniStatusWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let monitor: IpMonitor | null = null;
let isQuitting = false;
let lastDisplayStatus: DisplayStatus | null = null;
let miniDragState: { startMouseX: number; startMouseY: number; startWindowX: number; startWindowY: number } | null = null;

app.setName("VPN IP Guard");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  showMainWindow();
});

app.whenReady().then(() => {
  const config = getConfig();
  mainWindow = createMainWindow(config);
  const window = mainWindow;
  miniStatusWindow = createMiniStatusWindow(config);
  tray = createStatusTray(window, "green", {
    showMainWindow,
    hideToTray,
    quitApp
  });
  monitor = new IpMonitor(getConfig, updateConfig);

  wireIpc();
  wireMiniStatusWindow();

  monitor.on("snapshot", (snapshot: MonitorSnapshot) => {
    publishSnapshot(snapshot);
    updateTrayStatus(tray, snapshot.metrics.status);
    handleNotification(snapshot);
  });

  window.on("close", (event) => {
    if (isQuitting) {
      return;
    }
    event.preventDefault();
    hideToTray();
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
    hideToTray();
  });

  ipcMain.handle("show-main-window", () => {
    showMainWindow();
  });

  ipcMain.handle("hide-mini-status", () => {
    miniStatusWindow?.hide();
  });

  ipcMain.handle("quit-app", () => {
    quitApp();
  });

  ipcMain.on("mini-drag-start", (_event, screenX: number, screenY: number) => {
    if (!miniStatusWindow) {
      return;
    }
    const [startWindowX, startWindowY] = miniStatusWindow.getPosition();
    miniDragState = {
      startMouseX: screenX,
      startMouseY: screenY,
      startWindowX,
      startWindowY
    };
  });

  ipcMain.on("mini-drag-move", (_event, screenX: number, screenY: number) => {
    if (!miniStatusWindow || !miniDragState) {
      return;
    }
    miniStatusWindow.setPosition(
      Math.round(miniDragState.startWindowX + screenX - miniDragState.startMouseX),
      Math.round(miniDragState.startWindowY + screenY - miniDragState.startMouseY),
      false
    );
  });

  ipcMain.on("mini-drag-end", () => {
    if (!miniStatusWindow) {
      miniDragState = null;
      return;
    }
    const [x, y] = miniStatusWindow.getPosition();
    updateConfig({ miniStatusPosition: { x, y } });
    miniDragState = null;
  });
}

function wireMiniStatusWindow(): void {
  if (!miniStatusWindow) {
    return;
  }

  miniStatusWindow.on("move", () => {
    if (!miniStatusWindow || isQuitting || miniDragState) {
      return;
    }
    const [x, y] = miniStatusWindow.getPosition();
    updateConfig({ miniStatusPosition: { x, y } });
  });

  miniStatusWindow.webContents.on("context-menu", () => {
    if (!miniStatusWindow) {
      return;
    }
    Menu.buildFromTemplate([
      { label: "显示主窗口", click: showMainWindow },
      { label: "隐藏小 UI", click: () => miniStatusWindow?.hide() },
      { type: "separator" },
      { label: "退出", click: quitApp }
    ]).popup({ window: miniStatusWindow });
  });
}

function publishSnapshot(snapshot: MonitorSnapshot): void {
  mainWindow?.webContents.send("snapshot", snapshot);
  miniStatusWindow?.webContents.send("snapshot", snapshot);
}

function hideToTray(): void {
  mainWindow?.hide();
  miniStatusWindow?.showInactive();
}

function showMainWindow(): void {
  if (!mainWindow) {
    return;
  }
  miniStatusWindow?.hide();
  mainWindow.show();
  mainWindow.focus();
  positionBottomRight(mainWindow);
}

function quitApp(): void {
  isQuitting = true;
  monitor?.stop();
  app.quit();
}

function handleNotification(snapshot: MonitorSnapshot): void {
  const currentStatus = classifyDisplayStatus(snapshot);
  const previousStatus = lastDisplayStatus;
  lastDisplayStatus = currentStatus;

  if (!previousStatus || previousStatus === currentStatus) {
    return;
  }

  if (!shouldNotify(previousStatus, currentStatus, snapshot.config.notificationMode)) {
    return;
  }

  const notification = new Notification({
    title: "VPN IP Guard",
    body: getNotificationBody(currentStatus)
  });
  notification.on("click", showMainWindow);
  notification.show();
}

function shouldNotify(previousStatus: DisplayStatus, currentStatus: DisplayStatus, mode: NotificationMode): boolean {
  if (mode === "off") {
    return false;
  }

  if ((previousStatus === "safe" || previousStatus === "latency") && currentStatus === "risk") {
    return mode === "normal" || mode === "risk";
  }

  if (currentStatus === "danger" && previousStatus !== "danger") {
    return mode === "normal" || mode === "risk" || mode === "danger";
  }

  if ((previousStatus === "risk" || previousStatus === "danger") && currentStatus === "safe") {
    return mode === "normal" || mode === "risk" || (mode === "danger" && previousStatus === "danger");
  }

  return false;
}

function getNotificationBody(status: DisplayStatus): string {
  if (status === "danger") {
    return "当前状态：危险\n检测到明显网络异常，请查看详情。";
  }

  if (status === "risk") {
    return "当前状态：风险\n检测到 VPN 出口状态异常，请查看详情。";
  }

  return "当前状态：安全\nVPN 出口状态已恢复稳定。";
}
