const workerBase = 'https://cloud-worker.wongkiinging.workers.dev';
let chart; // Global chart instance

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
  fetchTemperature();
  fetchTrendData();

  setInterval(fetchTemperature, 3000);
  setInterval(fetchTrendData, 5000);
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

    const pidRes = await fetch(`${workerBase}/pid_status`, { credentials: "include" });
    const pidData = await pidRes.json();
    document.getElementById("kp").value = pidData.kp;
    document.getElementById("ti").value = pidData.ti;
    document.getElementById("td").value = pidData.td;

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
  } catch (err) {
    console.error("Failed to fetch initial params:", err);
  }
}

// -------------------- Indicator Helper --------------------
function updateIndicator(id, isOn) {
  const el = document.getElementById(id);
  el.style.backgroundColor = isOn ? "green" : "red";
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


// -------------------- Trend Chart --------------------
async function fetchTrendData() {
  try {
    const res = await fetch(`${workerBase}/trend`, { credentials: "include" });
    const trend = await res.json();

    const labels = trend.map(d => d.time);
    const pvData = trend.map(d => d.pv);
    const mvData = trend.map(d => d.mv);

    if (!chart) {
      const ctx = document.getElementById('trendChart').getContext('2d');
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label: 'PV (°C)', data: pvData, borderColor: 'red', yAxisID: 'y', tension: 0.3 },
            { label: 'MV (%)', data: mvData, borderColor: 'blue', yAxisID: 'y1', tension: 0.3 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          stacked: false,
          scales: {
            y: { type: 'linear', position: 'left', min: 0, max: 150, ticks: { stepSize: 25 }, title: { display: true, text: 'PV (°C)' }},
            y1: { type: 'linear', position: 'right', min: 0, max: 100, ticks: { stepSize: 20 }, grid: { drawOnChartArea: false }, title: { display: true, text: 'MV (%)' }}
          }
        }
      });
    } else {
      chart.data.labels = labels;
      chart.data.datasets[0].data = pvData;
      chart.data.datasets[1].data = mvData;
      chart.update();
    }
  } catch (error) {
    console.error("Failed to fetch trend data:", error);
  }
}

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

// ---- Send Setpoint ----
document.getElementById("send-setpoint-btn").addEventListener("click", async () => {
  const setpoint = document.getElementById("setpoint").value;
  try {
    await fetch(`${workerBase}/setpoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ setpoint })
    });
  } catch (err) {
    console.error("Error sending setpoint:", err);
  }
});

// ---- Send PID Parameters ----
document.getElementById("send-pid-btn").addEventListener("click", async () => {
  const kp = document.getElementById("pb").value;
  const ti = document.getElementById("ti").value;
  const td = document.getElementById("td").value;
  try {
    await fetch(`${workerBase}/pid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ pb, ti, td })
    });
  } catch (err) {
    console.error("Error sending PID params:", err);
  }
});

// ---- Send mv_manual ----
document.getElementById("send-manual-btn").addEventListener("click", async () => {
  const mv_manual = document.getElementById("mv_manual").value;
  try {
    await fetch(`${workerBase}/mv_manual`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ mv_manual })
    });
  } catch (err) {
    console.error("Error sending manual MV:", err);
  }
});
