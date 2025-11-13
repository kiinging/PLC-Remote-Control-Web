// public/script-main.js
const workerBase = 'https://cloud-worker.wongkiinging.workers.dev';
const wsUrl      = "wss://cloud-worker.wongkiinging.workers.dev/ws";
let chart; // Global chart instance
let socket;
let xAxisWindow = 360; // default number of samples
const xAxisStep = 60;  // step per click
const xAxisMin = 10;   // minimum samples
const xAxisMax = 450; // max samples to display
let mvData = [];
let pvData = [];
let spData = [];

// -------------------- Session Check --------------------
async function checkSession() {
  try {
    const res = await fetch("/api/session", { credentials: "include" });
    if (!res.ok) {
      // Not logged in → redirect to login
      window.location.href = "/login.html";
      return false;
    }
    return true;
  } catch (err) {
    console.error("Session check failed:", err);
    window.location.href = "/login.html";
    return false;
  }
}

// -------------------- Dashboard Init --------------------
document.addEventListener("DOMContentLoaded", async () => {
  const valid = await checkSession();
  if (!valid) return; // stop here if no session

  // ✅ only runs if user is logged in:
  fetchInitialParams();
  fetchInitialRelayStatus();
  fetchTemperature();

  setInterval(fetchTemperature, 3000);
  setInterval(updateTuneIndicator, 4000);

  // ✅ Restore video if relay was previously alive
  const relayAlive = localStorage.getItem("relayAlive") === "true";
  if (relayAlive) {
    console.log("Restoring video stream after refresh...");
    startVideo();
  }

});

// -------------------- Logout Timer --------------------
document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname === "/dashboard.html") {
    const LOGOUT_AFTER = 2 * 60 * 60 * 1000; // 2 hours
    let logoutTimer;

    function resetLogoutTimer() {
      clearTimeout(logoutTimer);
      logoutTimer = setTimeout(async () => {
        await fetch("/api/logout", { method: "POST", credentials: "include" });
        alert("Your session expired. Please log in again.");
        window.location.href = "/login.html";
      }, LOGOUT_AFTER);
    }

    // ✅ Reset timer on user activity
    ["click", "keydown", "mousemove", "scroll"].forEach(evt =>
      document.addEventListener(evt, resetLogoutTimer)
    );

    // ✅ Start the first timer
    resetLogoutTimer();

    // ✅ Poll session every 5 minutes (server-side expiry check)
    setInterval(async () => {
      const res = await fetch("/api/session", { credentials: "include" });
      if (!res.ok) {
        alert("Your session expired. Please log in again.");
        window.location.href = "/login.html";
      }
    }, 5 * 60 * 1000);
  }
});


// -------------------- Fetch Initial Setpoint & PID --------------------
async function fetchInitialParams() {
  try {
    const setRes = await fetch(`${workerBase}/setpoint_status`, { credentials: "include" });
    const setData = await setRes.json();
    document.getElementById("setpoint").value = setData.setpoint;

    const mvRes = await fetch(`${workerBase}/mv_manual_status`, { credentials: "include" });
    const mvData = await mvRes.json();
    document.getElementById("mv_manual").value = mvData.mv_manual;

    const tuneSetRes = await fetch(`${workerBase}/tune_setpoint_status`, { credentials: "include" });
    const tuneSetData = await tuneSetRes.json();
    document.getElementById("tune-setpoint").value = tuneSetData.setpoint;

    const pidRes = await fetch(`${workerBase}/pid_params`, { credentials: "include" });
    const pidData = await pidRes.json();
    document.getElementById("pb").value = Number(pidData.pb).toFixed(2);
    document.getElementById("ti").value = pidData.ti;
    document.getElementById("td").value = pidData.td;
    document.getElementById("tune-pb").value = Number(pidData.pb).toFixed(2);
    document.getElementById("tune-ti").value = pidData.ti;
    document.getElementById("tune-td").value = pidData.td;

    const statusRes = await fetch(`${workerBase}/control_status`, { credentials: "include" });
    const statusData = await statusRes.json();

    updateIndicator("light-indicator", statusData.light === 1);
    updateIndicator("plc-indicator", statusData.plc === 1);
    updateIndicator("web-indicator", statusData.web === 1);
    updateModeIndicator(statusData.mode);  //red/yellow/green for manual/auto/tune

    // Show/hide setting groups based on mode
    // Show/hide setting groups based on mode
    if (statusData.mode === 0) {              // Manual
      document.getElementById("pid-setting-group").style.display = "none";
      document.getElementById("manual-setting-group").style.display = "block";
      document.getElementById("tune-setting-group").style.display = "none";
    } else if (statusData.mode === 1) {       // Auto
      document.getElementById("pid-setting-group").style.display = "block";
      document.getElementById("manual-setting-group").style.display = "none";
      document.getElementById("tune-setting-group").style.display = "none";
    } else if (statusData.mode === 2) {       // Tune
      document.getElementById("pid-setting-group").style.display = "none";
      document.getElementById("manual-setting-group").style.display = "none";
      document.getElementById("tune-setting-group").style.display = "block";
    } else {                                  // Fallback (unknown mode)
      document.getElementById("pid-setting-group").style.display = "block";
      document.getElementById("manual-setting-group").style.display = "none";
      document.getElementById("tune-setting-group").style.display = "none";
    }

    // ✅ Tune indicator initial check (add here)
    try {
      const tuneRes = await fetch(`${workerBase}/tune_status`, { credentials: "include" });
      const tuneData = await tuneRes.json();
      updateIndicator("tune-indicator", tuneData.tuning_active);
    } catch (err) {
      console.warn("Tune indicator fetch failed:", err);
    }

  } catch (err) {
    console.error("Failed to fetch initial params:", err);
  }
}

async function fetchInitialRelayStatus() {
  try {
    const res = await fetch(`${workerBase}/relay`, { cache: "no-store" });
    const data = await res.json();

    if (data.booting) {
      updateIndicator("relay-indicator", "booting");
    }

    if (data.alive) {
      // 🧠 Start WebSocket here:
      setTimeout(connectWS, 5000); // wait 5s, then connect
      updateIndicator("relay-indicator", true);
      videoEl.src =  RADXA_STREAM_URL;  // show video
      videoEl.style.opacity = "1";  
    } else {
      updateIndicator("relay-indicator", false);
      videoEl.src = "";                // hide video
      videoEl.style.opacity = "0.2";
    }
  } catch (err) {
    console.error("Failed to fetch relay status:", err);
    updateIndicator("relay-indicator", false);
    videoEl.src = "";
    videoEl.style.opacity = "0.2";
  }
}

//--------------------- Indicator Helper --------------------
function updateIndicator(id, state) {
  const el = document.getElementById(id);
  if (!el) return;

  if (state === true) el.style.backgroundColor = "green";
  else if (state === "booting") el.style.backgroundColor = "orange";
  else el.style.backgroundColor = "red";
}


function updateModeIndicator(mode) {
  const el = document.getElementById("mode-indicator");
  if (mode === 0) {        // Manual
    el.style.backgroundColor = "red";
  } else if (mode === 1) { // Auto
    el.style.backgroundColor = "green";
  } else if (mode === 2) { // Tune
    el.style.backgroundColor = "yellow";
  } else {
    el.style.backgroundColor = "gray"; // fallback / unknown
  }
}

async function updateTuneIndicator() {
  try {
    const res = await fetch(`${workerBase}/tune_status`, { credentials: "include" });
    const data = await res.json();
    updateIndicator("tune-indicator", data.tuning_active);
  } catch (err) {
    console.error("Failed to fetch tune indicator:", err);
  }
}


// -------------------- Light Control --------------------
document.getElementById('light-start-btn').addEventListener('click', async () => {
  const res = await fetch(`${workerBase}/start_light`, { method: 'POST', credentials: "include" });
  const data = await res.json();
  updateIndicator("light-indicator", data.light === 1);
});
document.getElementById('light-stop-btn').addEventListener('click', async () => {
  const res = await fetch(`${workerBase}/stop_light`, { method: 'POST', credentials: "include" });
  const data = await res.json();
  updateIndicator("light-indicator", data.light === 1);
});

// -------------------- Web Control --------------------
document.getElementById('web-start-btn').addEventListener('click', async () => {
  const res = await fetch(`${workerBase}/start_web`, { method: 'POST', credentials: "include" });
  const data = await res.json();
  updateIndicator("web-indicator", data.web === 1);
});
document.getElementById('web-stop-btn').addEventListener('click', async () => {
  const res = await fetch(`${workerBase}/stop_web`, { method: 'POST', credentials: "include" });
  const data = await res.json();
  updateIndicator("web-indicator", data.web === 1);
});

// -------------------- PLC Heater Control --------------------
document.getElementById('plc-start-btn').addEventListener('click', async () => {
  const res = await fetch(`${workerBase}/start_plc`, { method: 'POST', credentials: "include" });
  const data = await res.json();
  updateIndicator("plc-indicator", data.plc === 1);
});
document.getElementById('plc-stop-btn').addEventListener('click', async () => {
  const res = await fetch(`${workerBase}/stop_plc`, { method: 'POST', credentials: "include" });
  const data = await res.json();
  updateIndicator("plc-indicator", data.plc === 1);
});

// -------------------- Mode Control --------------------
document.getElementById("manual-btn").addEventListener("click", async () => {
  const res = await fetch(`${workerBase}/manual_mode`, { method: 'POST', credentials: "include" });
  const data = await res.json();
  updateModeIndicator(data.mode);
  document.getElementById("pid-setting-group").style.display = "none";
  document.getElementById("manual-setting-group").style.display = "block";
  document.getElementById("tune-setting-group").style.display = "none";
});
document.getElementById("auto-btn").addEventListener("click", async () => {
  const res = await fetch(`${workerBase}/auto_mode`, { method: 'POST', credentials: "include" });
  const data = await res.json();
  updateModeIndicator(data.mode);
  document.getElementById("pid-setting-group").style.display = "block";
  document.getElementById("manual-setting-group").style.display = "none";
  document.getElementById("tune-setting-group").style.display = "none";
});
document.getElementById("tune-btn").addEventListener("click", async () => {
  const res = await fetch(`${workerBase}/tune_mode`, { method: 'POST', credentials: "include" });
  const data = await res.json();
  updateModeIndicator(data.mode);
  document.getElementById("pid-setting-group").style.display = "none";
  document.getElementById("manual-setting-group").style.display = "none";
  document.getElementById("tune-setting-group").style.display = "block";
});

// -------------------- Trend Chart Setup --------------------
const datasets = [
  { label: 'MV (%)', data: mvData, borderColor: 'blue', yAxisID: 'y', tension: 0.3 },
  { label: 'PV (°C)', data: pvData, borderColor: 'red', yAxisID: 'y1', tension: 0.3 },
  { label: 'SP (°C)', data: spData, borderColor: 'green', yAxisID: 'y1', tension: 0.3, borderDash: [5,5] } // dashed line
];
let maxDisplayMinutes = 30;

const ctx = document.getElementById('trendChart').getContext('2d');
chart = new Chart(ctx, {
  type: 'line',
  data: { labels: [], datasets },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      y:  { type: 'linear', position: 'left', min: 0, max: 100, title: { display: true, text: 'MV (%)' }},
      y1: { type: 'linear', position: 'right', min: 20, max: 150, grid: { drawOnChartArea: false }, title: { display: true, text: 'PV/SP (°C)' }}
    }
  }
});


function addTrendPoint({ time, sp, pv, mv }) {
  if (!chart) return;
  
  // Push new data
  chart.data.labels.push(time);
  chart.data.datasets[0].data.push(mv);  // MV (%)
  chart.data.datasets[1].data.push(pv);  // PV (°C)
  chart.data.datasets[2].data.push(sp);  // SP (°C)


  // Remove old points beyond 30 minutes
  const cutoff = new Date(time).getTime() - maxDisplayMinutes*60*1000;
  while(chart.data.labels.length > 0 && new Date(chart.data.labels[0]).getTime() < cutoff){
    chart.data.labels.shift();
    chart.data.datasets.forEach(ds => ds.data.shift());
  }

  chart.update('none'); // smooth streaming
}



// -------------------- X-Axis Control --------------------
document.getElementById("increase-xaxis").addEventListener("click", () => {
  maxDisplayMinutes += 5;
  if(maxDisplayMinutes > 60) maxDisplayMinutes = 60; // cap at 60 min
});

document.getElementById("decrease-xaxis").addEventListener("click", () => {
  maxDisplayMinutes -= 5;
  if(maxDisplayMinutes < 5) maxDisplayMinutes = 5; // minimum 5 min
});

// -------------------- Temperature Fetch --------------------
async function fetchTemperature() {
  try {
    const res = await fetch(`${workerBase}/temp`, { credentials: "include" });
    const data = await res.json();
    document.getElementById('rtd-temp').innerText = data.rtd_temp.toFixed(2);
    document.getElementById('last-update').innerText = data.last_update;
  } catch (error) {
    console.error("Failed to fetch temperature:", error);
  }
}

// ---- Send Setpoint with Acknowledgement ----
document.getElementById("send-setpoint-btn").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const setpoint = document.getElementById("setpoint").value;

  // Turn button red to indicate sending
  button.classList.remove("btn-primary");
  button.classList.add("btn-danger");

  try {
    // Send new setpoint to worker
    await fetch(`${workerBase}/setpoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ setpoint })
    });

    // Poll for acknowledgement every 500 ms
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${workerBase}/setpoint_ack`, { credentials: "include" });
        const data = await resp.json();

        if (data.acknowledged) {
          // Setpoint successfully updated at PLC
          clearInterval(interval);

          // Turn button blue again
          button.classList.remove("btn-danger");
          button.classList.add("btn-primary");
        }
      } catch (err) {
        console.error("Error checking setpoint status:", err);
      }
    }, 500);

  } catch (err) {
    console.error("Error sending setpoint:", err);
    // Reset to blue if failed
    button.classList.remove("btn-danger");
    button.classList.add("btn-primary");
  }
});

// ---- Send PID Parameters ----
document.getElementById("send-pid-btn").addEventListener("click", async (event) => {
  const button = event.currentTarget; // ✅ get the clicked button
  const pb = document.getElementById("pb").value;
  const ti = document.getElementById("ti").value;
  const td = document.getElementById("td").value;

  // Turn button red to indicate sending
  button.classList.remove("btn-primary");
  button.classList.add("btn-danger");

  try {
    await fetch(`${workerBase}/pid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pb, ti, td })
    });

    // Start polling every 500ms to check acknowledgement
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${workerBase}/pid_ack`);
        const data = await resp.json();

        if (data.acknowledged) {
          // PID reached PLC, stop polling
          clearInterval(interval);
          // Turn button blue again
          button.classList.remove("btn-danger");
          button.classList.add("btn-primary");
        }
      } catch (err) {
        console.error("Error checking PID status:", err);
      }
    }, 500);

  } catch (err) {
    console.error("Error sending PID params:", err);
    // Optional: reset button to blue on failure
    button.classList.remove("btn-danger");
    button.classList.add("btn-primary");
  }
});

// ---- Send Manual MV with Handshake ----
document.getElementById("send-manual-btn").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const mv_manual = document.getElementById("mv_manual").value;

  // Turn button red to indicate sending
  button.classList.remove("btn-primary");
  button.classList.add("btn-danger");

  try {
    // Send manual MV to worker
    await fetch(`${workerBase}/mv_manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mv_manual })
    });

    // Poll the worker every 500 ms to check for acknowledgement
    const interval = setInterval(async () => {
      try {
        const resp = await fetch(`${workerBase}/mv_manual_ack`, { credentials: "include" });
        const data = await resp.json();

        if (data.acknowledged) {
          // Acknowledged by PLC → stop polling
          clearInterval(interval);

          // Turn button back to blue
          button.classList.remove("btn-danger");
          button.classList.add("btn-primary");
        }
      } catch (err) {
        console.error("Error checking mv_manual status:", err);
      }
    }, 500);

  } catch (err) {
    console.error("Error sending manual MV:", err);
    // Reset to blue if failed
    button.classList.remove("btn-danger");
    button.classList.add("btn-primary");
  }
});
//////////////////////////////////////////
//------ AUTO TUNING CONTROLS ------
/////////////////////////////////////////
// ---- Send Tune Setpoint ----
document.getElementById("send-tune-setpoint-btn").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  const setpoint = document.getElementById("tune-setpoint").value;

  // Turn button red to indicate sending
  button.classList.remove("btn-primary");
  button.classList.add("btn-danger");

  try {
    await fetch(`${workerBase}/tune_setpoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ setpoint })
    });

    // Poll for ack
    const maxPollTime = 10000; // 10 seconds
    const startTime = Date.now();
    const interval = setInterval(async () => {
      if (Date.now() - startTime > maxPollTime) {
        clearInterval(interval);
        button.classList.remove("btn-danger");
        button.classList.add("btn-primary");
        console.warn("Timeout waiting for tune_setpoint ack");
        return;
      }
      try {
        const resp = await fetch(`${workerBase}/tune_setpoint_ack`, { credentials: "include" });
        const data = await resp.json();

        if (data.acknowledged) {
          clearInterval(interval);
          button.classList.remove("btn-danger");
          button.classList.add("btn-primary");
        }
      } catch (err) {
        console.error("Error checking tune_setpoint ack:", err);
      }
    }, 500);

  } catch (err) {
    console.error("Error sending tune setpoint:", err);
    button.classList.remove("btn-danger");
    button.classList.add("btn-primary");
  }
});

let tuneStatusInterval = null;

// ---- Start Auto-Tune ----
document.getElementById("start-tune-btn").addEventListener("click", async (event) => {
  const button = event.currentTarget;

  // ✅ Ignore if a tune is already running
  if (button.dataset.tuning === "true") {
    console.warn("Tuning already active — ignoring second click.");
    return;
  }

  // Turn button red (sending)
  button.classList.remove("btn-primary");
  button.classList.add("btn-danger");

  // Mark as active immediately (prevents re-click)
  button.dataset.tuning = "true";
  button.disabled = true;

  // Defensive cleanup: clear any leftover interval just in case
  if (tuneStatusInterval) {
    clearInterval(tuneStatusInterval);
    tuneStatusInterval = null;
  }
  
  try {
    // 1️⃣ Send start command to backend
    await fetch(`${workerBase}/tune_start`, {
      method: "POST",
      credentials: "include"
    });

    // 2️⃣ Poll for acknowledgment from PLC (max 10 s)
    const maxPollTime = 10000; // 10 seconds
    const startTime = Date.now();

    const ackInterval = setInterval(async () => {
      if (Date.now() - startTime > maxPollTime) {
        clearInterval(ackInterval);
        button.classList.remove("btn-danger");
        button.classList.add("btn-warning"); // yellow again
        console.warn("Timeout waiting for tune_start ack");
        return;
      }

      try {
        const resp = await fetch(`${workerBase}/tune_start_ack`, { credentials: "include" });
        const data = await resp.json();

        if (data.acknowledged) {
          clearInterval(ackInterval);
          console.log("Tune start acknowledged by PLC ✅");

          // Return button to original yellow color
          button.classList.remove("btn-danger");
          button.classList.add("btn-warning");

          // 3️⃣ Once ack received, turn indicator green
          updateIndicator("tune-indicator", true);

          // 4️⃣ Start periodic polling for tune status
          tuneStatusInterval = setInterval(async () => {
            try {
              const res = await fetch(`${workerBase}/tune_status`, { credentials: "include" });
              const data = await res.json();

              if (data.tuning_active) {
                updateIndicator("tune-indicator", true); // green during tuning
              }
              else if (data.tune_completed) {
                // ✅ tuning completed
                updateIndicator("tune-indicator", false);
                clearInterval(tuneStatusInterval);
                tuneStatusInterval = null;

                // Allow new tune to start
                button.dataset.tuning = "false";
                button.disabled = false;

                // ✅ Optional: refresh PID values automatically
                const pidRes = await fetch(`${workerBase}/pid_params`, { credentials: "include" });
                const pidData = await pidRes.json();

                document.getElementById("pb").value = Number(pidData.pb).toFixed(2);
                document.getElementById("ti").value = pidData.ti;
                document.getElementById("td").value = pidData.td;
                document.getElementById("tune-pb").value = Number(pidData.pb).toFixed(2);
                document.getElementById("tune-ti").value = pidData.ti;
                document.getElementById("tune-td").value = pidData.td;
              }
            else {
                updateIndicator("tune-indicator", false); // red if not tuning
            }
            } catch (err) {
              console.error("Error fetching tune status:", err);
            }
          }, 5000); // poll every 5 s
        }
      } catch (err) {
        console.error("Error checking tune_start ack:", err);
      }
    }, 500); // poll every 0.5 s

  } catch (err) {
    console.error("Error starting tuning:", err);
    // Reset so user can retry
    button.dataset.tuning = "false";
    button.disabled = false;
    button.classList.remove("btn-danger");
    button.classList.add("btn-primary");
  }
});

// ---- Stop Auto-Tune ----
document.getElementById("stop-tune-btn").addEventListener("click", async () => {
  try {
    // Send stop request to backend
    await fetch(`${workerBase}/tune_stop`, { method: "POST", credentials: "include" });

    // Stop polling and reset state
    if (tuneStatusInterval) {
      clearInterval(tuneStatusInterval);
      tuneStatusInterval = null;
    }

    updateIndicator("tune-indicator", false);
    const startBtn = document.getElementById("start-tune-btn");
    startBtn.dataset.tuning = "false";
    startBtn.disabled = false;

    console.log("Tuning stopped by operator.");

    // ✅ Fetch and restore latest PID values after tuning stops
    const pidRes = await fetch(`${workerBase}/pid_params`, { credentials: "include" });
    const pidData = await pidRes.json();

    // Update Tune result fields with the restored PID values
    document.getElementById("tune-pb").value = Number(pidData.pb).toFixed(2);
    document.getElementById("tune-ti").value = pidData.ti;
    document.getElementById("tune-td").value = pidData.td;

    console.log("PID parameters restored after stopping tune:", pidData);

  } catch (err) {
    console.error("Error stopping tuning:", err);
  }
});

// ---- Relay ON ----
document.getElementById("relay-on-btn").addEventListener("click", async () => {
  try {
    await fetch(`${workerBase}/relay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ relay: true })
    });

    updateIndicator("relay-indicator", "booting");
    startCountdown();

    const start = Date.now();
    const maxWait = 60000;
    const interval = 2000;

    const poll = setInterval(async () => {
      const res = await fetch(`${workerBase}/relay`, { cache: "no-store" });
      const data = await res.json();

      if (data.booting) {
        updateIndicator("relay-indicator", "booting");
      }

      if (data.alive) {
        clearInterval(poll);
        updateIndicator("relay-indicator", true);        
        localStorage.setItem("relayAlive", "true"); // ✅ Save relay alive state
        setTimeout(startVideo, 3000);   // Wait for camera to stabilize
//        
      } else if (Date.now() - start > maxWait) {
        clearInterval(poll);
        updateIndicator("relay-indicator", false);
      }
    }, interval);

  } catch (err) {
    console.error("Relay ON error:", err);
    updateIndicator("relay-indicator", false);
  }
});

// ---- Relay OFF ----
document.getElementById("relay-off-btn").addEventListener("click", async () => {
  await fetch(`${workerBase}/relay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ relay: false })
  });
  updateIndicator("relay-indicator", false);
  localStorage.removeItem("relayAlive"); // ✅ clear alive state
  videoFeed.src = ""; // stop video
  videoFeed.style.opacity = "0.2";  
  disconnectWS();  // ✅ Disconnect WebSocket
});
 
//-------------------------------------------
// 🧠 Radxa Video Auto Control (Improved)
//-------------------------------------------
const videoFeed = document.getElementById("video_feed");
const RADXA_STREAM_URL = "https://cloud-worker.wongkiinging.workers.dev/video_feed";
const overlay = document.getElementById("countdownOverlay");
const countdownElement = document.getElementById("countdown");

let countdownTimer = null;

function startCountdown(duration = 60) {
  clearInterval(countdownTimer);
  let countdown = duration;
  countdownElement.textContent = countdown;
  overlay.style.display = "flex";
  overlay.style.opacity = "1";

  countdownTimer = setInterval(() => {
    countdown--;
    countdownElement.textContent = countdown;
    if (countdown <= 0) clearInterval(countdownTimer);
  }, 1000);
}

function startVideo() {
  // Add timestamp to prevent caching
  videoFeed.src = RADXA_STREAM_URL + "?t=" + Date.now();
  videoFeed.style.display = "block";
  overlay.style.transition = "opacity 0.5s ease";
  overlay.style.opacity = "0";
  setTimeout(() => overlay.style.display = "none", 600);
}


// If the video loads early, remove overlay immediately
videoFeed.addEventListener("load", () => {
  if (overlay.style.display !== "none") {
    clearInterval(timer);
    startVideo();
  }
});

document.getElementById("logout-btn")?.addEventListener("click", async () => {
  const res = await fetch("/api/logout", { method: "POST", credentials: "include" });
  if (res.ok) {
    // ✅ Logout successful — redirect to login page
    window.location.href = "/login.html";
  } else {
    alert("Logout failed. Please try again.");
  }
});


// Cloudflare Worker endpoint (secure)
function connectWS() {
  if (socket && socket.readyState === WebSocket.OPEN) return; // already connected

  socket = new WebSocket(wsUrl);
  socket.onopen = () => console.log("WS connected");
  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    // Update trend chart if pv/mv/time exist
    if (data.pv !== undefined && data.mv !== undefined && data.time !== undefined) {
      addTrendPoint({
        time: data.time, // ISO string or HH:mm:ss
        sp: data.sp,
        pv: data.pv,
        mv: data.mv
      });
    }   
  };

  socket.onclose = () => {
    console.warn("⚠️ WebSocket closed. Reconnecting in 3s...");
    setTimeout(connectWS, 3000);
  };

  socket.onerror = (err) => {
    console.error("❌ WebSocket error:", err);
  };
}

connectWS();

function disconnectWS() {
  if (socket) {
    console.log("🔌 Closing WebSocket...");
    socket.onclose = null;  // prevent auto-reconnect
    socket.onerror = null;
    socket.close();
    socket = null;
  }
}
