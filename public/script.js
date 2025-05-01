const workerBase = 'https://cloud-worker.wongkiinging.workers.dev';

document.getElementById('start-btn').addEventListener('click', async () => {
  try {
    const response = await fetch(`${workerBase}/start`, { method: 'POST' });
    const text = await response.text();
    console.log("Start response:", text);
    // Immediately fetch updated state
    fetchTemperature();
  } catch (err) {
    console.error("Error starting:", err);
  }
});

document.getElementById('stop-btn').addEventListener('click', async () => {
  try {
    const response = await fetch(`${workerBase}/stop`, { method: 'POST' });
    const text = await response.text();
    console.log("Stop response:", text);
    // Immediately fetch updated state
    fetchTemperature();
  } catch (err) {
    console.error("Error stopping:", err);
  }
});

async function fetchTemperature() {
  try {
    const res = await fetch(`${workerBase}/temp`);
    const data = await res.json();

    document.getElementById('rtd-temp').innerText = data.rtd_temp.toFixed(2);
    document.getElementById('thermo-temp').innerText = data.thermo_temp.toFixed(2);
    document.getElementById('internal-temp').innerText = data.internal_temp.toFixed(2);
    document.getElementById('fault').innerText = data.fault ? "Yes" : "No";
    document.getElementById('last-update').innerText = data.last_update;

    // Update LED/status indicator
    document.getElementById('status-indicator').innerText = data.power_on ? "ON" : "OFF";

    // Update power_on label
    const powerElem = document.getElementById('power_on');
    powerElem.innerText = data.power_on ? "ON" : "OFF";
    powerElem.classList.toggle('text-success', data.power_on);
    powerElem.classList.toggle('text-danger', !data.power_on);

  } catch (error) {
    console.error("Failed to fetch temperature:", error);
  }
}

setInterval(fetchTemperature, 3000);
fetchTemperature();
