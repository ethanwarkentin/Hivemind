"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const pty = __importStar(require("node-pty"));
const child_process_1 = require("child_process");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Store = require("electron-store").default;
const isDev = !electron_1.app.isPackaged;
const store = new Store({
    defaults: {
        layout: "auto",
        defaultCwd: "",
        windowBounds: null,
        windowMaximized: true,
        fontSize: 14,
        restoreSession: true,
        session: [],
    },
});
const terminals = new Map();
function createWindow() {
    const bounds = store.get("windowBounds");
    const maximized = store.get("windowMaximized");
    const win = new electron_1.BrowserWindow({
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
        }
        else {
            store.set("windowMaximized", false);
            store.set("windowBounds", win.getBounds());
        }
    };
    win.on("resize", saveWindowState);
    win.on("move", saveWindowState);
    if (isDev) {
        win.loadURL("http://localhost:5174");
    }
    else {
        win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    }
}
// ── Settings IPC ──────────────────────────────────────────────
electron_1.ipcMain.handle("settings:get", () => {
    return {
        layout: store.get("layout"),
        defaultCwd: store.get("defaultCwd"),
        fontSize: store.get("fontSize"),
        restoreSession: store.get("restoreSession"),
    };
});
// ── Session persistence ──────────────────────────────────────
let lastGoodSession = [];
electron_1.ipcMain.on("hivemind:saveSession", (_event, terminalList) => {
    // Save empty sessions too (clears previous session when user closes all terminals)
    const session = terminalList.map((t) => ({
        title: t.title,
        cwd: t.cwd || store.get("defaultCwd") || os.homedir(),
        hadClaude: t.hadClaude || false,
    }));
    lastGoodSession = session;
    store.set("session", session);
});
electron_1.ipcMain.handle("hivemind:getSession", () => {
    return store.get("session");
});
electron_1.ipcMain.on("settings:set", (_event, { key, value }) => {
    store.set(key, value);
});
// ── Terminal IPC ──────────────────────────────────────────────
const defaultShell = os.platform() === "win32"
    ? "powershell.exe"
    : process.env.SHELL || "/bin/bash";
electron_1.ipcMain.handle("terminal:create", (_event, opts = {}) => {
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
        env: { ...cleanEnv, TERM: "xterm-256color" },
    });
    terminals.set(id, proc);
    proc.onData((data) => {
        const wins = electron_1.BrowserWindow.getAllWindows();
        for (const w of wins) {
            w.webContents.send("terminal:data", { id, data });
        }
    });
    proc.onExit(({ exitCode }) => {
        const wins = electron_1.BrowserWindow.getAllWindows();
        for (const w of wins) {
            w.webContents.send("terminal:exit", { id, exitCode });
        }
        terminals.delete(id);
    });
    return { id, shell, cwd, pid: proc.pid };
});
electron_1.ipcMain.on("terminal:input", (_event, { id, data }) => {
    const proc = terminals.get(id);
    if (proc)
        proc.write(data);
});
electron_1.ipcMain.on("terminal:resize", (_event, { id, cols, rows }) => {
    const proc = terminals.get(id);
    if (proc) {
        try {
            proc.resize(cols, rows);
        }
        catch {
            // ignore resize on dead terminal
        }
    }
});
electron_1.ipcMain.handle("terminal:checkClaude", (_event, { id }) => {
    const proc = terminals.get(id);
    if (!proc)
        return false;
    try {
        if (os.platform() === "win32") {
            const output = (0, child_process_1.execSync)(`wmic process where "ParentProcessId=${proc.pid}" get Name /format:csv`, { encoding: "utf-8", timeout: 3000 });
            return /claude/i.test(output);
        }
        else {
            const output = (0, child_process_1.execSync)(`ps --ppid ${proc.pid} -o comm= 2>/dev/null || pgrep -P ${proc.pid} -l`, { encoding: "utf-8", timeout: 3000 });
            return /claude/i.test(output);
        }
    }
    catch {
        return false;
    }
});
electron_1.ipcMain.on("terminal:kill", (_event, { id }) => {
    const proc = terminals.get(id);
    if (proc) {
        proc.kill();
        terminals.delete(id);
    }
});
// ── App lifecycle ─────────────────────────────────────────────
electron_1.app.whenReady().then(createWindow);
electron_1.app.on("before-quit", () => {
    // Persist the last known good session before shutdown
    if (lastGoodSession.length > 0) {
        store.set("session", lastGoodSession);
    }
});
electron_1.app.on("window-all-closed", () => {
    for (const [, proc] of terminals) {
        try {
            proc.kill();
        }
        catch {
            // ignore — console may already be detached
        }
    }
    terminals.clear();
    electron_1.app.quit();
});
electron_1.app.on("activate", () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
