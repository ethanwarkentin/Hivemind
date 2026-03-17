declare global {
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

  interface FightCreateOpts {
    name: string;
    description: string;
    fighter1: { title: string; terminal_id: string };
    fighter2: { title: string; terminal_id: string };
  }

  interface FightState {
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

  interface FightAPI {
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

  interface Window {
    terminal: TerminalAPI;
    settings: SettingsAPI;
    hivemind: HivemindAPI;
    updater: UpdaterAPI;
    fight: FightAPI;
  }

  const __APP_VERSION__: string;
}

export {};
