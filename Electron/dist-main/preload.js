"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const terminalAPI = {
    create: (opts) => electron_1.ipcRenderer.invoke("terminal:create", opts),
    write: (id, data) => electron_1.ipcRenderer.send("terminal:input", { id, data }),
    resize: (id, cols, rows) => electron_1.ipcRenderer.send("terminal:resize", { id, cols, rows }),
    kill: (id) => electron_1.ipcRenderer.send("terminal:kill", { id }),
    checkClaude: (id) => electron_1.ipcRenderer.invoke("terminal:checkClaude", { id }),
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
const settingsAPI = {
    get: () => electron_1.ipcRenderer.invoke("settings:get"),
    set: (key, value) => electron_1.ipcRenderer.send("settings:set", { key, value }),
};
const hivemindAPI = {
    getDir: () => electron_1.ipcRenderer.invoke("hivemind:getDir"),
    checkClaude: () => electron_1.ipcRenderer.invoke("hivemind:checkClaude"),
    updateTerminals: (terminals) => electron_1.ipcRenderer.invoke("hivemind:updateTerminals", terminals),
    saveSession: (terminals) => electron_1.ipcRenderer.send("hivemind:saveSession", terminals),
    getSession: () => electron_1.ipcRenderer.invoke("hivemind:getSession"),
    registerMomma: (id) => electron_1.ipcRenderer.send("hivemind:registerMomma", { id }),
    unregisterMomma: () => electron_1.ipcRenderer.send("hivemind:unregisterMomma"),
};
electron_1.contextBridge.exposeInMainWorld("terminal", terminalAPI);
electron_1.contextBridge.exposeInMainWorld("settings", settingsAPI);
electron_1.contextBridge.exposeInMainWorld("hivemind", hivemindAPI);
