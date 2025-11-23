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

// Current session / set state
let currentSessionId = null;
let currentSetId = null;

// Global gyro rep counter from backend
let lastGyroRepsSeen = 0;

// Per-set baseline + flag
let gyroBaselineForSet = 0;
let setActive = false;

// Tempo tracking per set
let lastRepTmsForSet = null;   // last rep's sensor timestamp (t_ms)
let sumTempoMsForSet = 0;      // sum of all tempo_ms
let tempoCountForSet = 0;      // number of reps with defined tempo

// For tempo calculation (wall-clock)
let setStartWallMs = null;       // Date.now() when set started
let lastRepWallMsForTempo = null; // wall time of previous rep in this set

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

  ws.on("message", async (msg) => {
    let payload;
    try {
      payload = JSON.parse(msg.toString());
    } catch (e) {
      console.error("Bad client message:", msg.toString());
      return;
    }

    if (payload.type === "start_set") {
      await handleStartSet(payload);
    } else if (payload.type === "end_set") {
      await handleEndSet(payload);
    }
  });

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

// --- Initialize session only (sets created on demand) ---
async function initSession() {
  const nowIso = new Date().toISOString();

  const { data: sessionData, error: sessionErr } = await supabase
    .from("sessions")
    .insert({
      device_id: "demo-device-1",
      started_at: nowIso,
      notes: "Hack Western demo session",
    })
    .select()
    .single();

  if (sessionErr) {
    console.error("Error creating session:", sessionErr.message);
    throw sessionErr;
  }

  currentSessionId = sessionData.id;
  console.log("Initialized session", currentSessionId);
}

// --- Create a new set row in Supabase ---
async function createNewSet({ exerciseName, targetReps, startedAt }) {
  if (!currentSessionId) {
    console.warn("No session; creating one on the fly");
    await initSession();
  }

  const { data: setData, error: setErr } = await supabase
    .from("sets")
    .insert({
      session_id: currentSessionId,
      exercise_name: exerciseName || "demo_press",
      target_reps: targetReps ?? null,
      // you have created_at as a column, but Supabase can default it;
      // we also store when this set started
      created_at: startedAt || new Date().toISOString(),
    })
    .select()
    .single();

  if (setErr) {
    console.error("Error creating set:", setErr.message);
    throw setErr;
  }

  return setData.id;
}

// --- Handle start_set from frontend ---
async function handleStartSet(payload) {
  try {
    const clientTs = payload.client_ts
      ? new Date(payload.client_ts).toISOString()
      : new Date().toISOString();

    const exerciseName = payload.exercise_name || "demo_press";
    const targetReps = payload.target_reps ?? null;

    const newSetId = await createNewSet({
      exerciseName,
      targetReps,
      startedAt: clientTs,
    });

    currentSetId = newSetId;
    setActive = true;

    // Baseline is whatever the backend global counter is at this moment
    gyroBaselineForSet = lastGyroRepsSeen;

    // Wall-clock timing for tempo
    setStartWallMs = Date.now();
    lastRepWallMsForTempo = setStartWallMs; // first rep = time from set start

    // (optional but nice if you're using averages)
    sumTempoMsForSet = 0;
    tempoCountForSet = 0;

    console.log(
      `Started set ${currentSetId} (exercise=${exerciseName}) baseline=${gyroBaselineForSet} setStartWallMs=${setStartWallMs}`
    );
  } catch (err) {
    console.error("handleStartSet error:", err);
  }
}



// --- Handle end_set from frontend ---
async function handleEndSet(payload) {
  if (!currentSetId) {
    console.warn("end_set received but no active setId");
    return;
  }

  // frontend sends reps_gyro on end_set
  const repsGyro = payload.reps_gyro ?? null;
  const clientTs = payload.client_ts
    ? new Date(payload.client_ts).toISOString()
    : new Date().toISOString();

  setActive = false;

  // clear tempo state
  setStartWallMs = null;
  lastRepWallMsForTempo = null;

  // average tempo for this set (ignore first rep with null tempo)
  const avgTempoMs =
    tempoCountForSet > 0
      ? Math.round(sumTempoMsForSet / tempoCountForSet)
      : null;

  try {
    // Update the current set with summary info using your schema
    const updates = {
      actual_reps: repsGyro,
      avg_rep_time_ms: avgTempoMs,
      // avg_gyro_peak / avg_strain_ue can be filled later if you track them
    };

    const { error } = await supabase
      .from("sets")
      .update(updates)
      .eq("id", currentSetId);

    if (error) {
      console.error("Error updating set summary:", error.message);
    } else {
      console.log(
        `Set ${currentSetId} ended: reps=${repsGyro}, avg tempo=${avgTempoMs} ms`
      );
    }
  } catch (err) {
    console.error("handleEndSet error:", err);
  }

  // Clear current set; next Start Set will create a new one
  currentSetId = null;
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
        // expected from C++: { t_ms, amag, gyro_reps }
        obj = JSON.parse(line);
      } catch (e) {
        console.error("Bad JSON from backend:", line);
        continue;
      }

      // 1) Push raw frame to frontend
      broadcast(obj);

      // 2) Gyro-based reps only
      if (typeof obj.gyro_reps === "number") {
        const globalGyroReps = obj.gyro_reps;

        // Only log reps while a set is active and we have a set_id
        if (
          setActive &&
          currentSetId != null &&
          globalGyroReps > lastGyroRepsSeen
        ) {
          // If the sensor jumps by >1 for some reason, handle each rep
          const repsAdded = globalGyroReps - lastGyroRepsSeen;

          for (let i = 0; i < repsAdded; i++) {
            const globalRepIndex = lastGyroRepsSeen + 1 + i;
            const repIndexWithinSet = globalRepIndex - gyroBaselineForSet;

            // --- tempo = wall-clock time since previous rep (or since Start Set for rep 1) ---
            let tempoMs = null;
            const nowWall = Date.now();

            if (lastRepWallMsForTempo != null) {
              tempoMs = nowWall - lastRepWallMsForTempo;
            } else if (setStartWallMs != null) {
              // safety fallback; normally lastRepWallMsForTempo is set in handleStartSet
              tempoMs = nowWall - setStartWallMs;
            }

            lastRepWallMsForTempo = nowWall;

            // accumulate for average tempo if you want it in sets table
            if (typeof tempoMs === "number") {
              sumTempoMsForSet += tempoMs;
              tempoCountForSet += 1;
            }

            // Insert rep row
            supabase
              .from("reps")
              .insert({
                set_id: currentSetId,
                rep_index: repIndexWithinSet,
                t_ms_start: obj.t_ms,
                t_ms_end: obj.t_ms, // later you can track start/end separately
                peak_amag: obj.amag ?? null,
                peak_gyro: null,
                peak_strain_ue: null,
                tempo_ms: tempoMs,
              })
              .then(({ error }) => {
                if (error) {
                  console.error("Supabase insert error:", error.message);
                } else {
                  console.log(
                    `Inserted rep ${repIndexWithinSet} (tempo=${tempoMs}) into Supabase (set_id=${currentSetId})`
                  );
                }
              })
              .catch((err) => {
                console.error("Supabase insert exception:", err);
              });

            // Also send a rep_event to the frontend for tempo-based bar chart
            broadcast({
              type: "rep_event",
              rep_index: repIndexWithinSet,
              tempo_ms: tempoMs,
              t_ms: obj.t_ms,
            });
          }
        }

        // update global gyro count
        lastGyroRepsSeen = globalGyroReps;
      }
    }
  });

  child.stderr.on("data", (data) => {
    console.error("[backend stderr]", data.toString());
  });

  child.on("exit", (code) => {
    console.log("Backend exited with code", code);
  });
}


// --- Boot: init DB session, then start backend + HTTP/WS ---
initSession()
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
