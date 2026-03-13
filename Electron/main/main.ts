import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, IpcMainEvent } from "electron";
import * as path from "path";
import * as os from "os";
import * as pty from "node-pty";
import { execSync } from "child_process";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Store = require("electron-store").default;

const isDev = !app.isPackaged;

// ── Persistent settings ───────────────────────────────────────

interface AppSettings {
  layout: string;
  defaultCwd: string;
  windowBounds: { x: number; y: number; width: number; height: number } | null;
  windowMaximized: boolean;
  fontSize: number;
}

const store = new Store({
  defaults: {
    layout: "auto",
    defaultCwd: "",
    windowBounds: null,
    windowMaximized: true,
    fontSize: 14,
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
    backgroundColor: "#1a1b26",
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
  };
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

    const proc = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: { ...process.env, TERM: "xterm-256color" } as Record<string, string>,
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
        const output = execSync(
          `wmic process where "ParentProcessId=${proc.pid}" get Name /format:csv`,
          { encoding: "utf-8", timeout: 3000 }
        );
        return /claude/i.test(output);
      } else {
        const output = execSync(
          `ps --ppid ${proc.pid} -o comm= 2>/dev/null || pgrep -P ${proc.pid} -l`,
          { encoding: "utf-8", timeout: 3000 }
        );
        return /claude/i.test(output);
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

app.on("window-all-closed", () => {
  for (const [, proc] of terminals) {
    proc.kill();
  }
  terminals.clear();
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
