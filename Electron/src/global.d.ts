interface TerminalAPI {
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

interface SettingsAPI {
  get: () => Promise<{ layout: string; defaultCwd: string; fontSize: number; restoreSession: boolean; theme: string }>;
  set: (key: string, value: unknown) => void;
  browseFolder: () => Promise<string | null>;
}

interface HivemindAPI {
  saveSession: (terminals: Array<{ id: string; title: string; cwd?: string; hadClaude?: boolean }>) => void;
  getSession: () => Promise<Array<{ title: string; cwd: string; hadClaude: boolean }>>;
}

interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  downloadUrl?: string;
  releaseNotes?: string;
  error?: string;
}

interface UpdaterAPI {
  checkForUpdate: () => Promise<UpdateInfo>;
  downloadAndInstall: (downloadUrl: string) => Promise<{ success: boolean; error?: string }>;
}

declare global {
  interface Window {
    terminal: TerminalAPI;
    settings: SettingsAPI;
    hivemind: HivemindAPI;
    updater: UpdaterAPI;
  }
}

declare const __APP_VERSION__: string;

export {};
