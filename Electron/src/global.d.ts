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
  get: () => Promise<{ layout: string; defaultCwd: string; fontSize: number }>;
  set: (key: string, value: unknown) => void;
}

declare global {
  interface Window {
    terminal: TerminalAPI;
    settings: SettingsAPI;
  }
}

export {};
