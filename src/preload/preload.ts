import { contextBridge, ipcRenderer } from "electron";
import type { AppConfig, IpGuardApi, MonitorSnapshot } from "../shared/types.js";

const api: IpGuardApi = {
  getSnapshot: () => ipcRenderer.invoke("get-snapshot") as Promise<MonitorSnapshot>,
  runCheckNow: () => ipcRenderer.invoke("run-check-now") as Promise<MonitorSnapshot>,
  resetAndCheckNow: () => ipcRenderer.invoke("reset-and-check-now") as Promise<MonitorSnapshot>,
  updateConfig: (patch: Partial<AppConfig>) => ipcRenderer.invoke("update-config", patch) as Promise<MonitorSnapshot>,
  hideToTray: () => ipcRenderer.invoke("hide-to-tray") as Promise<void>,
  onSnapshot: (callback: (snapshot: MonitorSnapshot) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: MonitorSnapshot) => callback(snapshot);
    ipcRenderer.on("snapshot", listener);
    return () => ipcRenderer.removeListener("snapshot", listener);
  }
};

contextBridge.exposeInMainWorld("ipGuard", api);
