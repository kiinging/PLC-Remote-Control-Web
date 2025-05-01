const workerBase = 'https://cloud-worker.wongkiinging.workers.dev';

// DOM references
const powerOnEl = document.getElementById('power_on');
const rtdEl = document.getElementById('rtd-temp');
const thermoEl = document.getElementById('thermo-temp');
const internalEl = document.getElementById('internal-temp');
const faultEl = document.getElementById('fault');
const ledEl = document.getElementById('status-indicator');
const lastUpdateEl = document.getElementById('last-update');

// Chart setup
const ctx = document.createElement('canvas');
ctx.id = 'trendChart';
document.querySelector('.container').appendChild(ctx);

const chartData = {
  labels: [],
  datasets: [
    {
      label: 'RTD Temp (°C)',
      data: [],
      borderColor: 'rgba(255, 99, 132, 1)',
      fill: false
    },
    {
      label: 'MV (%)',
      data: [],
      borderColor: 'rgba(54, 162, 235, 1)',
      fill: false
    }
  ]
};

const trendChart = new Chart(ctx, {
  type: 'line',
  data: chartData,
  options: {
    responsive: true,
    scales: {
      x: {
        type: 'time',
        time: {
          tooltipFormat: 'HH:mm:ss',
          unit: 'minute'
        }
      },
      y: {
        beginAtZero: true
      }
    }
  }
});

// Add Start/Stop button logic
document.getElementById('start-btn').addEventListener('click', async () => {
  const res = await fetch(`${workerBase}/start`, { method: 'POST' });
  const text = await res.text();
  ledEl.innerText = text.includes("ON") ? "ON" : "OFF";
});

document.getElementById('stop-btn').addEventListener('click', async () => {
  const res = await fetch(`${workerBase}/stop`, { method: 'POST' });
  const text = await res.text();
  ledEl.innerText = text.includes("OFF") ? "OFF" : "ON";
});

// Fetch temperature and update trend
async function fetchTemperature() {
  try {
    const res = await fetch(`${workerBase}/temp`);
    const data = await res.json();

    rtdEl.innerText = data.rtd_temp.toFixed(2);
    thermoEl.innerText = data.thermo_temp.toFixed(2);
    internalEl.innerText = data.internal_temp.toFixed(2);
    faultEl.innerText = data.fault ? "Yes" : "No";
    lastUpdateEl.innerText = data.last_update;

    powerOnEl.innerText = data.power_on ? "ON" : "OFF";
    powerOnEl.classList.toggle('text-success', data.power_on);
    powerOnEl.classList.toggle('text-danger', !data.power_on);

    // Update Chart
    const now = new Date();
    chartData.labels.push(now);
    chartData.datasets[0].data.push(data.rtd_temp);
    chartData.datasets[1].data.push(data.mv || 0); // Assuming MV is included in /temp JSON

    // Limit to last 30 points
    if (chartData.labels.length > 30) {
      chartData.labels.shift();
      chartData.datasets[0].data.shift();
      chartData.datasets[1].data.shift();
    }

    trendChart.update();

  } catch (err) {
    console.error("Fetch error:", err);
  }
}

// PID tuning panel
const pidPanel = document.createElement('div');
pidPanel.className = 'panel';
pidPanel.innerHTML = `
  <h4>Remote PID Tuning</h4>
  <div class="mb-2">
    <label>P: <input id="kp" type="number" step="0.01" class="form-control" value="1.0"></label>
  </div>
  <div class="mb-2">
    <label>I: <input id="ki" type="number" step="0.01" class="form-control" value="0.1"></label>
  </div>
  <div class="mb-2">
    <label>D: <input id="kd" type="number" step="0.01" class="form-control" value="0.01"></label>
  </div>
  <button id="send-pid" class="btn btn-primary">Update PID</button>
`;
document.querySelector('.container').appendChild(pidPanel);

document.getElementById('send-pid').addEventListener('click', async () => {
  const kp = parseFloat(document.getElementById('kp').value);
  const ki = parseFloat(document.getElementById('ki').value);
  const kd = parseFloat(document.getElementById('kd').value);

  try {
    await fetch(`${workerBase}/pid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kp, ki, kd })
    });
    alert('PID updated!');
  } catch (err) {
    alert('Failed to update PID.');
    console.error(err);
  }
});

// Start updates
setInterval(fetchTemperature, 3000);
fetchTemperature();
