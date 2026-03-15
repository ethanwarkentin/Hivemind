import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, IpcMainEvent, dialog } from "electron";
import * as path from "path";
import * as os from "os";
import * as pty from "node-pty";
import { execSync } from "child_process";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Store = require("electron-store").default;

const isDev = !app.isPackaged;

// Separate dev and production data so they don't interfere with each other
if (isDev) {
  app.setPath("userData", path.join(app.getPath("userData"), "-dev"));
}

// ── Persistent settings ───────────────────────────────────────

interface SessionTerminal {
  title: string;
  cwd: string;
  hadClaude: boolean;
}

interface AppSettings {
  layout: string;
  defaultCwd: string;
  windowBounds: { x: number; y: number; width: number; height: number } | null;
  windowMaximized: boolean;
  fontSize: number;
  restoreSession: boolean;
  theme: string;
  session: SessionTerminal[];
}

const store = new Store({
  defaults: {
    layout: "auto",
    defaultCwd: "",
    windowBounds: null,
    windowMaximized: true,
    fontSize: 14,
    restoreSession: true,
    theme: "dark",
    session: [],
  },
});

// ── Terminal management ───────────────────────────────────────

interface TerminalCreateOpts {
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

const terminals = new Map<string, pty.IPty>();

function createWindow(): void {
  const bounds = store.get("windowBounds");
  const maximized = store.get("windowMaximized");

  const win = new BrowserWindow({
    width: bounds?.width || 1200,
    height: bounds?.height || 800,
    x: bounds?.x,
    y: bounds?.y,
    minWidth: 600,
    minHeight: 400,
    title: "Hivemind",
    icon: isDev
      ? path.join(__dirname, "..", "public", "icon.png")
      : path.join(process.resourcesPath, "icon.png"),
    backgroundColor: "#0d0e14",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);

  if (maximized) {
    win.maximize();
  }
  win.show();

  // Save window state on changes
  const saveWindowState = () => {
    if (win.isMaximized()) {
      store.set("windowMaximized", true);
    } else {
      store.set("windowMaximized", false);
      store.set("windowBounds", win.getBounds());
    }
  };
  win.on("resize", saveWindowState);
  win.on("move", saveWindowState);

  if (isDev) {
    win.loadURL("http://localhost:5174");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

// ── Settings IPC ──────────────────────────────────────────────

ipcMain.handle("settings:get", () => {
  return {
    layout: store.get("layout"),
    defaultCwd: store.get("defaultCwd"),
    fontSize: store.get("fontSize"),
    restoreSession: store.get("restoreSession"),
    theme: store.get("theme"),
  };
});

ipcMain.handle("settings:browseFolder", async () => {
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
    title: "Select Default Directory",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// ── Session persistence ──────────────────────────────────────

let lastGoodSession: SessionTerminal[] = [];

ipcMain.on("hivemind:saveSession", (_event: IpcMainEvent, terminalList: Array<{ id: string; title: string; cwd?: string; hadClaude?: boolean }>) => {
  // Save empty sessions too (clears previous session when user closes all terminals)
  const session: SessionTerminal[] = terminalList.map((t) => ({
    title: t.title,
    cwd: t.cwd || store.get("defaultCwd") as string || os.homedir(),
    hadClaude: t.hadClaude || false,
  }));
  lastGoodSession = session;
  store.set("session", session);
});

ipcMain.handle("hivemind:getSession", (): SessionTerminal[] => {
  return store.get("session") as SessionTerminal[];
});

ipcMain.on(
  "settings:set",
  (_event: IpcMainEvent, { key, value }: { key: string; value: unknown }) => {
    store.set(key as keyof AppSettings, value);
  }
);

// ── Terminal IPC ──────────────────────────────────────────────

const defaultShell: string =
  os.platform() === "win32"
    ? "powershell.exe"
    : process.env.SHELL || "/bin/bash";

ipcMain.handle(
  "terminal:create",
  (_event: IpcMainInvokeEvent, opts: TerminalCreateOpts = {}) => {
    const id = `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const shell = opts.shell || defaultShell;
    const savedCwd = store.get("defaultCwd");
    const cwd = opts.cwd || (savedCwd ? savedCwd : os.homedir());
    const cols = opts.cols || 80;
    const rows = opts.rows || 24;

    // Filter out VS Code / IDE related env vars to prevent Claude from auto-connecting
    const cleanEnv = { ...process.env };
    const ideVarsToRemove = [
      'VSCODE_GIT_IPC_HANDLE',
      'VSCODE_GIT_ASKPASS_NODE',
      'VSCODE_GIT_ASKPASS_MAIN',
      'VSCODE_GIT_ASKPASS_EXTRA_ARGS',
      'VSCODE_IPC_HOOK',
      'VSCODE_IPC_HOOK_CLI',
      'VSCODE_PID',
      'VSCODE_CWD',
      'VSCODE_NLS_CONFIG',
      'VSCODE_HANDLES_UNCAUGHT_ERRORS',
      'VSCODE_AMD_ENTRYPOINT',
      'ELECTRON_RUN_AS_NODE',
      'TERM_PROGRAM',
      'TERM_PROGRAM_VERSION',
    ];
    for (const v of ideVarsToRemove) {
      delete cleanEnv[v];
    }

    const proc = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: { ...cleanEnv, TERM: "xterm-256color" } as Record<string, string>,
    });

    terminals.set(id, proc);

    proc.onData((data: string) => {
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) {
        w.webContents.send("terminal:data", { id, data });
      }
    });

    proc.onExit(({ exitCode }: { exitCode: number }) => {
      const wins = BrowserWindow.getAllWindows();
      for (const w of wins) {
        w.webContents.send("terminal:exit", { id, exitCode });
      }
      terminals.delete(id);
    });

    return { id, shell, cwd, pid: proc.pid };
  }
);

ipcMain.on(
  "terminal:input",
  (_event: IpcMainEvent, { id, data }: { id: string; data: string }) => {
    const proc = terminals.get(id);
    if (proc) proc.write(data);
  }
);

ipcMain.on(
  "terminal:resize",
  (
    _event: IpcMainEvent,
    { id, cols, rows }: { id: string; cols: number; rows: number }
  ) => {
    const proc = terminals.get(id);
    if (proc) {
      try {
        proc.resize(cols, rows);
      } catch {
        // ignore resize on dead terminal
      }
    }
  }
);

ipcMain.handle(
  "terminal:checkClaude",
  (_event: IpcMainInvokeEvent, { id }: { id: string }): boolean => {
    const proc = terminals.get(id);
    if (!proc) return false;

    try {
      if (os.platform() === "win32") {
        // Get all processes with PIDs, parent PIDs, and command lines
        // Claude runs as node.exe with claude-code in the command line
        const output = execSync(
          `wmic process get ProcessId,ParentProcessId,CommandLine /format:csv`,
          { encoding: "utf-8", timeout: 5000 }
        );

        // Parse CSV output into maps
        const lines = output.trim().split("\n").filter(line => line.trim());
        const children = new Map<number, number[]>();
        const cmdLines = new Map<number, string>();

        for (const line of lines) {
          // CSV format: Node,CommandLine,ParentProcessId,ProcessId
          // But CommandLine can contain commas, so we need to parse carefully
          // Find the last two comma-separated values (ppid and pid)
          const match = line.match(/,(\d+),(\d+)\s*$/);
          if (match) {
            const ppid = parseInt(match[1], 10);
            const pid = parseInt(match[2], 10);
            // Extract command line (everything between first comma and the ,ppid,pid suffix)
            const firstComma = line.indexOf(",");
            const cmdLineEnd = line.lastIndexOf(`,${match[1]},${match[2]}`);
            const cmdLine = firstComma >= 0 && cmdLineEnd > firstComma
              ? line.substring(firstComma + 1, cmdLineEnd)
              : "";

            if (!isNaN(pid) && !isNaN(ppid)) {
              cmdLines.set(pid, cmdLine);
              if (!children.has(ppid)) {
                children.set(ppid, []);
              }
              children.get(ppid)!.push(pid);
            }
          }
        }

        // Recursively find all descendants of the shell process
        const findDescendants = (pid: number, visited: Set<number>): number[] => {
          if (visited.has(pid)) return [];
          visited.add(pid);
          const directChildren = children.get(pid) || [];
          let all = [...directChildren];
          for (const child of directChildren) {
            all = all.concat(findDescendants(child, visited));
          }
          return all;
        };

        const descendants = findDescendants(proc.pid, new Set());

        // Check if any descendant has "claude" in its command line
        for (const pid of descendants) {
          const cmdLine = cmdLines.get(pid);
          if (cmdLine && /claude/i.test(cmdLine)) {
            return true;
          }
        }
        return false;
      } else {
        // On Unix, use pstree or recursive ps to find all descendants
        // First try pgrep with -P to get all descendants recursively
        try {
          const output = execSync(
            `pstree -p ${proc.pid} 2>/dev/null || ps -e -o pid,ppid,comm`,
            { encoding: "utf-8", timeout: 5000 }
          );
          return /claude/i.test(output);
        } catch {
          // Fallback to checking direct children
          const output = execSync(
            `ps --ppid ${proc.pid} -o comm= 2>/dev/null || pgrep -P ${proc.pid} -l`,
            { encoding: "utf-8", timeout: 3000 }
          );
          return /claude/i.test(output);
        }
      }
    } catch {
      return false;
    }
  }
);

ipcMain.on(
  "terminal:kill",
  (_event: IpcMainEvent, { id }: { id: string }) => {
    const proc = terminals.get(id);
    if (proc) {
      proc.kill();
      terminals.delete(id);
    }
  }
);

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(createWindow);

app.on("before-quit", () => {
  // Persist the last known good session before shutdown
  if (lastGoodSession.length > 0) {
    store.set("session", lastGoodSession);
  }
});

app.on("window-all-closed", () => {
  for (const [, proc] of terminals) {
    try {
      proc.kill();
    } catch {
      // ignore — console may already be detached
    }
  }
  terminals.clear();
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
