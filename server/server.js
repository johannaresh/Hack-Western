// server/server.js
require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const WebSocket = require("ws");
const { createClient } = require("@supabase/supabase-js");

const PORT = 3000;

// --- Supabase client (cloud Postgres) ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// Current session / set state (no hardcoding)
let currentSessionId = null;
let currentSetId = null;
let lastAccelReps = 0;

// --- Basic HTTP server to serve index.html ---
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

// Helper: broadcast to all clients
function broadcast(obj) {
  const msg = JSON.stringify(obj);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  });
}

// --- Initialize a session + set in Supabase ---
async function initSessionAndSet() {
  // 1) Create a new session
  const { data: sessionData, error: sessionErr } = await supabase
    .from("sessions")
    .insert({ device_id: "demo-device-1", notes: "Hack Western demo session" })
    .select()
    .single();

  if (sessionErr) {
    console.error("Error creating session:", sessionErr.message);
    throw sessionErr;
  }

  currentSessionId = sessionData.id;

  // 2) Create a new set for this session
  const { data: setData, error: setErr } = await supabase
    .from("sets")
    .insert({
      session_id: currentSessionId,
      exercise_name: "demo_press", // later: pass real exercise name from frontend
      target_reps: 10,
    })
    .select()
    .single();

  if (setErr) {
    console.error("Error creating set:", setErr.message);
    throw setErr;
  }

  currentSetId = setData.id;
  console.log("Initialized session", currentSessionId, "set", currentSetId);
}

// --- Spawn the C++ rep engine and wire streaming ---
function startBackend() {
  const exePath = path.join(__dirname, "..", "build", "Debug", "presage_app.exe");
  console.log("Starting backend:", exePath);

  const child = spawn(exePath, [], {
    cwd: path.join(__dirname, ".."),
  });

  child.stdout.on("data", (data) => {
    const lines = data.toString().split(/\r?\n/).filter(Boolean);

    for (const line of lines) {
      console.log("BACKEND LINE:", line);

      let obj;
      try {
        obj = JSON.parse(line); // expected: { t_ms, amag, accel_reps, gyro_reps }
      } catch (e) {
        console.error("Bad JSON from backend:", line);
        continue;
      }

      // 1) Push to frontend
      broadcast(obj);

      // 2) Detect new accel rep and log to Supabase
      if (
        typeof obj.accel_reps === "number" &&
        obj.accel_reps > lastAccelReps &&
        currentSetId != null
      ) {
        const repIndex = obj.accel_reps;

        supabase
          .from("reps")
          .insert({
            set_id: currentSetId,
            rep_index: repIndex,
            t_ms_start: obj.t_ms,
            t_ms_end: obj.t_ms, // for now start=end; refine later
            peak_amag: obj.amag,
            peak_gyro: null,
            peak_strain_ue: null,
            tempo_ms: null,
          })
          .then(({ error }) => {
            if (error) {
              console.error("Supabase insert error:", error.message);
            } else {
              console.log(
                `Inserted rep ${repIndex} into Supabase (set_id=${currentSetId})`
              );
            }
          })
          .catch((err) => {
            console.error("Supabase insert exception:", err);
          });
      }

      lastAccelReps = obj.accel_reps;
    }
  });

  child.stderr.on("data", (data) => {
    console.error("[backend stderr]", data.toString());
  });

  child.on("exit", (code) => {
    console.log("Backend exited with code", code);
  });
}

// --- Boot: init DB session+set, then start backend + HTTP/WS ---
initSessionAndSet()
  .then(() => {
    startBackend();
    server.listen(PORT, () => {
      console.log(`Server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Fatal init error:", err);
    process.exit(1);
  });

  