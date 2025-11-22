// server/server.js
const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");

const PORT = 3000;

// basic HTTP server to serve index.html
const server = http.createServer((req, res) => {
  if (req.url === "/" || req.url === "/index.html") {
    const filePath = path.join(__dirname, "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        return res.end("Error loading index.html");
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end("Not found");
  }
});

// --- WebSocket server on top of HTTP ---
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
  console.log("Client connected");
  ws.on("close", () => console.log("Client disconnected"));
});

// helper: broadcast to all clients
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// --- Spawn the C++ rep engine ---
const exePath = path.join(
  __dirname,
  "..",
  "build",
  "Debug",
  "presage_app.exe"
);

console.log("Starting backend:", exePath);

const child = spawn(exePath, [], {
  cwd: path.join(__dirname, "..")
});

child.stdout.on("data", (data) => {
  const lines = data.toString().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    console.log("BACKEND LINE:", line);   // <-- add this

    try {
      const obj = JSON.parse(line);
      broadcast(obj);
    } catch (e) {
      console.error("Bad JSON from backend:", line);
    }
  }
});


child.stderr.on("data", (data) => {
  console.error("[backend stderr]", data.toString());
});

child.on("exit", (code) => {
  console.log("Backend exited with code", code);
});

// start HTTP + WebSocket
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
