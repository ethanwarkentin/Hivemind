const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const pty = require("node-pty");
const cors = require("cors");
const path = require("path");
const os = require("os");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

// Serve static files in production
const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get("*", (_req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// Track active terminals
const terminals = new Map();

const defaultShell =
  os.platform() === "win32"
    ? "powershell.exe"
    : process.env.SHELL || "/bin/bash";

io.on("connection", (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on("terminal:create", (opts = {}) => {
    const id = `term_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const shell = opts.shell || defaultShell;
    const cwd = opts.cwd || os.homedir();
    const cols = opts.cols || 80;
    const rows = opts.rows || 24;

    try {
      const proc = pty.spawn(shell, [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd,
        env: { ...process.env, TERM: "xterm-256color" },
      });

      terminals.set(id, proc);

      proc.onData((data) => {
        socket.emit("terminal:data", { id, data });
      });

      proc.onExit(({ exitCode }) => {
        socket.emit("terminal:exit", { id, exitCode });
        terminals.delete(id);
      });

      socket.emit("terminal:created", { id, shell, cwd, pid: proc.pid });
      console.log(`Terminal created: ${id} (PID: ${proc.pid})`);
    } catch (err) {
      socket.emit("terminal:error", {
        id,
        error: err.message,
      });
      console.error(`Failed to create terminal: ${err.message}`);
    }
  });

  socket.on("terminal:input", ({ id, data }) => {
    const proc = terminals.get(id);
    if (proc) {
      proc.write(data);
    }
  });

  socket.on("terminal:resize", ({ id, cols, rows }) => {
    const proc = terminals.get(id);
    if (proc) {
      try {
        proc.resize(cols, rows);
      } catch {
        // ignore resize errors on dead terminals
      }
    }
  });

  socket.on("terminal:kill", ({ id }) => {
    const proc = terminals.get(id);
    if (proc) {
      proc.kill();
      terminals.delete(id);
      console.log(`Terminal killed: ${id}`);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Client disconnected: ${socket.id}`);
    // Don't kill terminals on disconnect - allow reconnection
  });
});

// Cleanup on server shutdown
process.on("SIGINT", () => {
  for (const [id, proc] of terminals) {
    proc.kill();
    terminals.delete(id);
  }
  process.exit(0);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Hivemind server running on http://localhost:${PORT}`);
});
