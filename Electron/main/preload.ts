import { contextBridge, ipcRenderer, webUtils } from "electron";

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
  get: () => Promise<{ layout: string; defaultCwd: string; fontSize: number; restoreSession: boolean; theme: string; useClaudePersonas: boolean }>;
  set: (key: string, value: unknown) => void;
  browseFolder: () => Promise<string | null>;
}

export interface HivemindAPI {
  saveSession: (terminals: Array<{ id: string; title: string; cwd?: string; hadClaude?: boolean }>) => void;
  getSession: () => Promise<Array<{ title: string; cwd: string; hadClaude: boolean }>>;
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
  browseFolder: () => ipcRenderer.invoke("settings:browseFolder"),
};

const hivemindAPI: HivemindAPI = {
  saveSession: (terminals) => ipcRenderer.send("hivemind:saveSession", terminals),
  getSession: () => ipcRenderer.invoke("hivemind:getSession"),
};

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  downloadUrl?: string;
  releaseNotes?: string;
  error?: string;
}

export interface UpdaterAPI {
  checkForUpdate: () => Promise<UpdateInfo>;
  downloadAndInstall: (downloadUrl: string) => Promise<{ success: boolean; error?: string }>;
}

const updaterAPI: UpdaterAPI = {
  checkForUpdate: () => ipcRenderer.invoke("updater:checkForUpdate"),
  downloadAndInstall: (downloadUrl) => ipcRenderer.invoke("updater:downloadAndInstall", downloadUrl),
};

const utilsAPI = {
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
};

export interface FightCreateOpts {
  name: string;
  description: string;
  fighter1: { title: string; terminal_id: string };
  fighter2: { title: string; terminal_id: string };
}

export interface FightState {
  status: "active" | "paused" | "resolved";
  fight_name: string;
  fight_id: string;
  fight_path: string;
  started: string;
  round: number;
  turn: "fighter1" | "fighter2" | "momma";
  fighters: {
    fighter1: { title: string; terminal_id: string };
    fighter2: { title: string; terminal_id: string };
  };
  momma_terminal_id: string;
  last_file: string;
  summary: string;
  next_prompt: string;
  prompt_seq: number;
}

export interface FightAPI {
  create: (opts: FightCreateOpts) => Promise<{
    fightState: FightState;
    mommaTerminal: { id: string; shell: string; cwd: string; pid: number };
  }>;
  getState: () => Promise<FightState | null>;
  message: (message: string) => void;
  pause: () => void;
  resume: () => void;
  resolve: (resolution?: string) => void;
  end: () => void;
  sendPrompt: (id: string, text: string) => void;
  onStateUpdate: (callback: (state: FightState) => void) => void;
  removeAllListeners: () => void;
}

const fightAPI: FightAPI = {
  create: (opts) => ipcRenderer.invoke("fight:create", opts),
  getState: () => ipcRenderer.invoke("fight:getState"),
  message: (message) => ipcRenderer.send("fight:message", message),
  pause: () => ipcRenderer.send("fight:pause"),
  resume: () => ipcRenderer.send("fight:resume"),
  resolve: (resolution) => ipcRenderer.send("fight:resolve", resolution),
  end: () => ipcRenderer.send("fight:end"),
  sendPrompt: (id, text) => ipcRenderer.send("fight:sendPrompt", { id, text }),
  onStateUpdate: (callback) => {
    ipcRenderer.on("fight:stateUpdate", (_event, state) => callback(state));
  },
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners("fight:stateUpdate");
  },
};

contextBridge.exposeInMainWorld("terminal", terminalAPI);
contextBridge.exposeInMainWorld("settings", settingsAPI);
contextBridge.exposeInMainWorld("hivemind", hivemindAPI);
contextBridge.exposeInMainWorld("electronUtils", utilsAPI);
contextBridge.exposeInMainWorld("updater", updaterAPI);
contextBridge.exposeInMainWorld("fight", fightAPI);
