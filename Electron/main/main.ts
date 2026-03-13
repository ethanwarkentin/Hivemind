import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, IpcMainEvent } from "electron";
import * as path from "path";
import * as os from "os";
import * as pty from "node-pty";

const isDev = !app.isPackaged;

interface TerminalCreateOpts {
  shell?: string;
  cwd?: string;
  cols?: number;
  rows?: number;
}

const terminals = new Map<string, pty.IPty>();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    title: "Hivemind",
    backgroundColor: "#1a1b26",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    win.loadURL("http://localhost:5174");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

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
    const cwd = opts.cwd || os.homedir();
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
