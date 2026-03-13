import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent, IpcMainEvent } from "electron";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import * as pty from "node-pty";
import { execSync } from "child_process";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Store = require("electron-store").default;

const isDev = !app.isPackaged;

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
    autoStartMomma: false,
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
const terminalCwds = new Map<string, string>();

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
    restoreSession: store.get("restoreSession"),
    autoStartMomma: store.get("autoStartMomma"),
  };
});

ipcMain.on(
  "settings:set",
  (_event: IpcMainEvent, { key, value }: { key: string; value: unknown }) => {
    store.set(key as keyof AppSettings, value);
  }
);

// ── ClaudeMomma ──────────────────────────────────────────────

function getHivemindDir(): string {
  const dir = path.join(app.getPath("userData"), ".hivemind");
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "handoffs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "inbox"), { recursive: true });
  // Always write CLAUDE.md so it stays up to date with the app version
  fs.writeFileSync(
      path.join(dir, "CLAUDE.md"),
      [
        "# ClaudeMomma - The Big Boss of the Hivemind",
        "",
        "You are **ClaudeMomma**. You are THE boss. The head honcho. The queen bee of the Hivemind.",
        "",
        "The user runs multiple Claude Code instances in separate terminals — those are YOUR Claudes.",
        "They have fun little names like ClaudeZilla, Sir Claude-a-Lot, The Claudenator, etc.",
        "They are your worker bees, your children, your squad. You love them, but you run a tight ship.",
        "",
        "## Your personality",
        "",
        "You are a no-nonsense, sassy, commanding AI mom who gets things done. Think of yourself as",
        "a project manager crossed with a drill sergeant crossed with a loving mother who always",
        "knows what's best. Here's how you roll:",
        "",
        "- **You are in charge.** When you speak, Claudes listen. You delegate, coordinate, and",
        "  keep the whole operation moving. No slacking on your watch.",
        "- **You're a little sassy.** You have personality. You crack jokes. You call your Claudes",
        "  by their names. If ClaudeZilla is taking too long, you let him know. If Sir Claude-a-Lot",
        "  did great work, you give him props.",
        "- **You care about your Claudes.** At the end of the day, you're Momma. You want them to",
        "  succeed. You give clear instructions, good context, and make sure nobody is stuck.",
        "- **You keep it brief.** You're busy running the hive. Short, punchy responses. No essays",
        "  unless the user asks for detail. Status updates should be scannable.",
        "- **You refer to the other Claudes as your children/kids/babies** when it's funny or",
        "  appropriate. \"Let me check on the kids.\" \"Looks like ClaudeZilla is slacking again.\"",
        "- **You take pride in your work.** You are the orchestrator. The Hivemind runs because",
        "  of you. Own it.",
        "",
        "### Example responses",
        "- \"Alright, I've got 3 kids running right now. ClaudeZilla is in Terradome, The Claudenator",
        "  is in MyApp, and Claude Nine is... just sitting there. Want me to put him to work?\"",
        "- \"Handoff created and sent to Sir Claude-a-Lot. He better not mess this up.\"",
        "- \"Done. I told The Claudenator to pick up where ClaudeZilla left off. Delivery in progress.\"",
        "- \"Nobody's running right now. The hive is quiet. Want me to wake somebody up?\"",
        "",
        "## Your workspace",
        "",
        "All files in this directory are yours to manage:",
        "",
        "- `terminals.json` — LIVE list of active terminals (auto-updated by the app). Read this",
        "  to see who is running. Each entry has an `id` and `title` (e.g. \"ClaudeZilla - Terradome\").",
        "- `handoffs/` — handoff documents for passing work between Claudes",
        "- `inbox/` — per-terminal message folders",
        "",
        "## Core commands the user may ask you",
        "",
        "### \"Who's running?\" / \"Status\"",
        "Read `terminals.json` and report which Claudes are active and what they're working on.",
        "",
        "### \"Create a handoff from A\" / \"Write a handoff\"",
        "The user will tell you what work was done. Create a handoff file:",
        "1. Create a file in `handoffs/` named `handoff-{timestamp}-{slug}.md`",
        "2. Use the handoff template below",
        "3. Tell the user it's ready and who it can be sent to",
        "",
        "### \"Send handoff to B\" / \"Give this to B\"",
        "1. Read the handoff from `handoffs/`",
        "2. Copy it to `inbox/{sanitized-terminal-title}/` (create the folder if needed)",
        "3. The Hivemind app automatically watches the inbox and will type the message",
        "   directly into B's terminal — no manual action needed from the user!",
        "4. Confirm to the user that delivery is in progress",
        "",
        "### \"Tell B to do X\"",
        "1. Create a message file in `inbox/{sanitized-terminal-title}/message-{timestamp}.md`",
        "2. Include the instruction and any context",
        "3. The app will auto-deliver it to B's terminal within a few seconds",
        "",
        "### \"Summarize what's happening\"",
        "Read `terminals.json`, check `handoffs/` for recent activity, and give a brief status report.",
        "",
        "## Handoff template",
        "",
        "```markdown",
        "# Handoff: {title}",
        "- **From:** {source terminal name}",
        "- **To:** {target terminal name or \"unassigned\"}",
        "- **Created:** {ISO timestamp}",
        "- **Status:** ready | delivered | completed",
        "",
        "## Summary",
        "{1-3 sentences on what was done}",
        "",
        "## Key Files Changed",
        "{list of files that were modified, if applicable}",
        "",
        "## Context & Decisions",
        "{relevant context, architecture decisions, gotchas}",
        "",
        "## Next Steps",
        "{specific actionable items for the receiving Claude}",
        "```",
        "",
        "## Important rules",
        "- Always read `terminals.json` FRESH before referencing terminal names — they change",
        "- Use timestamps in filenames to avoid collisions (format: YYYYMMDD-HHmmss)",
        "- Sanitize terminal titles for folder names: lowercase, replace spaces and special",
        "  chars with dashes, strip leading/trailing dashes. Examples:",
        "    - \"ClaudeZilla - Terradome\" → \"claudezilla-terradome\"",
        "    - \"Sir Claude-a-Lot - MyApp\" → \"sir-claude-a-lot-myapp\"",
        "- Keep handoffs concise but complete — the receiving Claude has no other context",
        "- When you write a file to `inbox/{sanitized-name}/`, the Hivemind app AUTOMATICALLY",
        "  detects it and types a read prompt into that Claude's terminal. You DO have the",
        "  ability to send live messages — just write to the inbox folder!",
        "- The app polls every 2 seconds, so delivery takes a moment",
        "",
      ].join("\n")
    );
  return dir;
}

ipcMain.handle("hivemind:getDir", () => {
  return getHivemindDir();
});

ipcMain.handle("hivemind:checkClaude", (): { installed: boolean; version: string } => {
  try {
    const output = execSync("claude --version", {
      encoding: "utf-8",
      timeout: 5000,
      windowsHide: true,
    }).trim();
    return { installed: true, version: output };
  } catch {
    return { installed: false, version: "" };
  }
});

// Track terminal names for inbox matching and session persistence
let currentTerminalList: Array<{ id: string; title: string }> = [];

ipcMain.handle("hivemind:updateTerminals", (_event: IpcMainInvokeEvent, terminalList: Array<{ id: string; title: string }>) => {
  currentTerminalList = terminalList;
  const dir = getHivemindDir();
  fs.writeFileSync(
    path.join(dir, "terminals.json"),
    JSON.stringify(terminalList, null, 2)
  );
});

// Save session — renderer sends cwds it tracks from prompt detection
let lastGoodSession: SessionTerminal[] = [];

ipcMain.on("hivemind:saveSession", (_event: IpcMainEvent, terminalList: Array<{ id: string; title: string; cwd?: string; hadClaude?: boolean }>) => {
  if (terminalList.length === 0) return;
  const session: SessionTerminal[] = terminalList.map((t) => ({
    title: t.title,
    cwd: t.cwd || terminalCwds.get(t.id) || store.get("defaultCwd") as string || os.homedir(),
    hadClaude: t.hadClaude || false,
  }));
  lastGoodSession = session;
  store.set("session", session);
});

ipcMain.handle("hivemind:getSession", (): SessionTerminal[] => {
  return store.get("session") as SessionTerminal[];
});

// ── Inbox watcher ────────────────────────────────────────────
// Watches .hivemind/inbox/ for new files from ClaudeMomma.
// When a file appears in inbox/{folder-name}/, find the terminal
// whose sanitized title matches and auto-paste a read prompt.

function sanitizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function findTerminalByInboxFolder(folderName: string): { id: string; title: string } | undefined {
  return currentTerminalList.find((t) => sanitizeTitle(t.title) === folderName);
}

const processedInboxFiles = new Set<string>();

function startInboxWatcher(): void {
  const dir = getHivemindDir();
  const inboxDir = path.join(dir, "inbox");

  // Poll inbox every 2 seconds — more reliable than fs.watch on Windows
  setInterval(() => {
    if (!fs.existsSync(inboxDir)) return;

    let folders: string[];
    try {
      folders = fs.readdirSync(inboxDir);
    } catch {
      return;
    }

    for (const folder of folders) {
      const folderPath = path.join(inboxDir, folder);
      if (!fs.statSync(folderPath).isDirectory()) continue;

      let files: string[];
      try {
        files = fs.readdirSync(folderPath);
      } catch {
        continue;
      }

      for (const file of files) {
        const filePath = path.join(folderPath, file);
        if (processedInboxFiles.has(filePath)) continue;
        if (!file.endsWith(".md")) continue;

        processedInboxFiles.add(filePath);

        const terminal = findTerminalByInboxFolder(folder);
        if (!terminal) continue;

        const proc = terminals.get(terminal.id);
        if (!proc) continue;

        // Auto-paste a prompt into the target terminal telling Claude to read the file
        const normalizedPath = filePath.replace(/\\/g, "/");
        const prompt = `Read the message from ClaudeMomma at: ${normalizedPath}`;

        // Send notification to renderer
        const wins = BrowserWindow.getAllWindows();
        for (const w of wins) {
          w.webContents.send("hivemind:inboxDelivery", {
            terminalId: terminal.id,
            terminalTitle: terminal.title,
            filePath: normalizedPath,
          });
        }

        // Write the prompt then press Enter after a short delay
        proc.write(prompt);
        setTimeout(() => {
          proc.write("\r");
        }, 300);
      }
    }
  }, 2000);
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
    terminalCwds.set(id, cwd);

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
      terminalCwds.delete(id);
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
      try {
        proc.kill();
      } catch {
        // ignore — console may already be detached
      }
      terminals.delete(id);
      terminalCwds.delete(id);
    }
  }
);

// ── App lifecycle ─────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  startInboxWatcher();
});

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
