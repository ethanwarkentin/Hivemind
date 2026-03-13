import { contextBridge, ipcRenderer } from "electron";

export interface TerminalAPI {
  create: (opts?: {
    shell?: string;
    cwd?: string;
    cols?: number;
    rows?: number;
  }) => Promise<{ id: string; shell: string; cwd: string; pid: number }>;
  write: (id: string, data: string) => void;
  resize: (id: string, cols: number, rows: number) => void;
  kill: (id: string) => void;
  checkClaude: (id: string) => Promise<boolean>;
  onData: (callback: (payload: { id: string; data: string }) => void) => void;
  onExit: (
    callback: (payload: { id: string; exitCode: number }) => void
  ) => void;
  removeAllListeners: () => void;
}

export interface SettingsAPI {
  get: () => Promise<{ layout: string; defaultCwd: string; fontSize: number }>;
  set: (key: string, value: unknown) => void;
}

const terminalAPI: TerminalAPI = {
  create: (opts) => ipcRenderer.invoke("terminal:create", opts),
  write: (id, data) => ipcRenderer.send("terminal:input", { id, data }),
  resize: (id, cols, rows) =>
    ipcRenderer.send("terminal:resize", { id, cols, rows }),
  kill: (id) => ipcRenderer.send("terminal:kill", { id }),
  checkClaude: (id) => ipcRenderer.invoke("terminal:checkClaude", { id }),
  onData: (callback) => {
    ipcRenderer.on("terminal:data", (_event, payload) => callback(payload));
  },
  onExit: (callback) => {
    ipcRenderer.on("terminal:exit", (_event, payload) => callback(payload));
  },
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners("terminal:data");
    ipcRenderer.removeAllListeners("terminal:exit");
  },
};

const settingsAPI: SettingsAPI = {
  get: () => ipcRenderer.invoke("settings:get"),
  set: (key, value) => ipcRenderer.send("settings:set", { key, value }),
};

export interface HivemindAPI {
  getDir: () => Promise<string>;
  checkClaude: () => Promise<{ installed: boolean; version: string }>;
  updateTerminals: (terminals: Array<{ id: string; title: string }>) => Promise<void>;
  saveSession: (terminals: Array<{ id: string; title: string }>) => void;
  getSession: () => Promise<Array<{ title: string; cwd: string }>>;
}

const hivemindAPI: HivemindAPI = {
  getDir: () => ipcRenderer.invoke("hivemind:getDir"),
  checkClaude: () => ipcRenderer.invoke("hivemind:checkClaude"),
  updateTerminals: (terminals) => ipcRenderer.invoke("hivemind:updateTerminals", terminals),
  saveSession: (terminals) => ipcRenderer.send("hivemind:saveSession", terminals),
  getSession: () => ipcRenderer.invoke("hivemind:getSession"),
};

contextBridge.exposeInMainWorld("terminal", terminalAPI);
contextBridge.exposeInMainWorld("settings", settingsAPI);
contextBridge.exposeInMainWorld("hivemind", hivemindAPI);
