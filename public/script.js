const workerBase = 'https://cloud-worker.wongkiinging.workers.dev';

document.getElementById('start-btn').addEventListener('click', async () => {
  const response = await fetch(`${workerBase}/start`, { method: 'POST' });
  const text = await response.text();
  document.getElementById('status-indicator').innerText = text.includes("ON") ? "ON" : "OFF";
});

document.getElementById('stop-btn').addEventListener('click', async () => {
  const response = await fetch(`${workerBase}/stop`, { method: 'POST' });
  const text = await response.text();
  document.getElementById('status-indicator').innerText = text.includes("OFF") ? "OFF" : "ON";
});

// Fetch temperature and update page
async function fetchTemperature() {
  try {
    const res = await fetch(`${workerBase}/temp`);
    const data = await res.json();

    document.getElementById('rtd-temp').innerText = data.rtd_temp.toFixed(2);
    document.getElementById('thermo-temp').innerText = data.thermo_temp.toFixed(2);
    document.getElementById('internal-temp').innerText = data.internal_temp.toFixed(2);
    document.getElementById('fault').innerText = data.fault ? "Yes" : "No";
    document.getElementById('last-update').innerText = data.last_update;
  } catch (error) {
    console.error("Failed to fetch temperature:", error);
  }
}

// Update temperature every 3 seconds
setInterval(fetchTemperature, 3000);
fetchTemperature(); // Fetch once immediately
