"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const terminalAPI = {
    create: (opts) => electron_1.ipcRenderer.invoke("terminal:create", opts),
    write: (id, data) => electron_1.ipcRenderer.send("terminal:input", { id, data }),
    resize: (id, cols, rows) => electron_1.ipcRenderer.send("terminal:resize", { id, cols, rows }),
    kill: (id) => electron_1.ipcRenderer.send("terminal:kill", { id }),
    onData: (callback) => {
        electron_1.ipcRenderer.on("terminal:data", (_event, payload) => callback(payload));
    },
    onExit: (callback) => {
        electron_1.ipcRenderer.on("terminal:exit", (_event, payload) => callback(payload));
    },
    removeAllListeners: () => {
        electron_1.ipcRenderer.removeAllListeners("terminal:data");
        electron_1.ipcRenderer.removeAllListeners("terminal:exit");
    },
};
electron_1.contextBridge.exposeInMainWorld("terminal", terminalAPI);
