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
const isDev = !electron_1.app.isPackaged;
const terminals = new Map();
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1200,
        height: 800,
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
    win.maximize();
    win.show();
    if (isDev) {
        win.loadURL("http://localhost:5174");
    }
    else {
        win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
    }
}
// ── Terminal IPC ──────────────────────────────────────────────
const defaultShell = os.platform() === "win32"
    ? "powershell.exe"
    : process.env.SHELL || "/bin/bash";
electron_1.ipcMain.handle("terminal:create", (_event, opts = {}) => {
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
        env: { ...process.env, TERM: "xterm-256color" },
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
electron_1.app.on("window-all-closed", () => {
    for (const [, proc] of terminals) {
        proc.kill();
    }
    terminals.clear();
    electron_1.app.quit();
});
electron_1.app.on("activate", () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
