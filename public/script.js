const workerBase = 'https://cloud-worker.wongkiinging.workers.dev';

let chart; // Global chart instance

// -------------------- Fetch Initial Setpoint & PID --------------------
async function fetchInitialParams() {
  try {
    // Get setpoint
    const setRes = await fetch(`${workerBase}/setpoint_status`);
    const setData = await setRes.json();
    document.getElementById("setpoint").value = setData.setpoint;

    // Get PID params
    const pidRes = await fetch(`${workerBase}/pid_status`);
    const pidData = await pidRes.json();
    document.getElementById("kp").value = pidData.kp;
    document.getElementById("ti").value = pidData.ti;
    document.getElementById("td").value = pidData.td;

    //GET ligth & plc status
    const statusRes = await fetch(`${workerBase}/light_plc_status`);
    const statusData = await statusRes.json();
    updateIndicator("light-indicator", statusData.light === 1);
    updateIndicator("plc-indicator", statusData.plc === 1);

    console.log("Fetched initial setpoint & PID:", { setData, pidData,  statusData });
  } catch (err) {
    console.error("Failed to fetch initial params:", err);
  }
}

// Run this once on page load
fetchInitialParams();

// -------------------- Light Control --------------------
document.getElementById('light-start-btn').addEventListener('click', async () => {
  const res = await fetch(`${workerBase}/light/on`, { method: 'POST' });
  const data = await res.json();
  updateIndicator("light-indicator", data.light === 1);
});

document.getElementById('light-stop-btn').addEventListener('click', async () => {
  const res = await fetch(`${workerBase}/light/off`, { method: 'POST' });
  const data = await res.json();
  updateIndicator("light-indicator", data.light === 1);
});

// -------------------- PLC Heater Control --------------------
document.getElementById('plc-start-btn').addEventListener('click', async () => {
  const res = await fetch(`${workerBase}/start_plc`, { method: 'POST' });
  const data = await res.json();
  updateIndicator("plc-indicator", data.plc === 1);
});

document.getElementById('plc-stop-btn').addEventListener('click', async () => {
  const res = await fetch(`${workerBase}/stop_plc`, { method: 'POST' });
  const data = await res.json();
  updateIndicator("plc-indicator", data.plc === 1);
});


// -------------------- Indicator Helper --------------------
function updateIndicator(id, isOn) {
  const el = document.getElementById(id);
  el.style.backgroundColor = isOn ? "green" : "red";
}

// -------------------- Trend Chart --------------------
async function fetchTrendData() {
  try {
    const res = await fetch(`${workerBase}/trend`);
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
            {
              label: 'PV (°C)',
              data: pvData,
              borderColor: 'red',
              yAxisID: 'y',
              tension: 0.3,
            },
            {
              label: 'MV (%)',
              data: mvData,
              borderColor: 'blue',
              yAxisID: 'y1',
              tension: 0.3,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          stacked: false,
          scales: {
            y: {
              type: 'linear',
              position: 'left',
              min: 0,
              max: 150,
              ticks: { stepSize: 25 },
              title: { display: true, text: 'PV (°C)' },
            },
            y1: {
              type: 'linear',
              position: 'right',
              min: 0,
              max: 100,
              ticks: { stepSize: 20 },
              grid: { drawOnChartArea: false },
              title: { display: true, text: 'MV (%)' },
            }
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
    const res = await fetch(`${workerBase}/temp`);
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
    const res = await fetch(`${workerBase}/setpoint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setpoint })
    });
    console.log("Setpoint update response:", await res.text());
  } catch (err) {
    console.error("Error sending setpoint:", err);
  }
});

// ---- Send PID Parameters (Kp, Ti, Td) ----
document.getElementById("send-pid-btn").addEventListener("click", async () => {
  const kp = document.getElementById("kp").value;
  const ti = document.getElementById("ti").value;
  const td = document.getElementById("td").value;

  try {
    const res = await fetch(`${workerBase}/pid`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kp, ti, td })
    });
    console.log("PID update response:", await res.text());
  } catch (err) {
    console.error("Error sending PID params:", err);
  }
});


// -------------------- Auto Fetch Loops --------------------
setInterval(fetchTemperature, 3000);
fetchTemperature();

setInterval(fetchTrendData, 5000);
fetchTrendData();
