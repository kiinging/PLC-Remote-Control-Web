document.getElementById('start-btn').addEventListener('click', async () => {
    const response = await fetch('https://cloud-worker.wongkiinging.workers.dev/start', {
      method: 'POST',
    });
  
    const text = await response.text();
    document.getElementById('status-indicator').innerText = text.includes("ON") ? "ON" : "OFF";
  });
  
  document.getElementById('stop-btn').addEventListener('click', async () => {
    const response = await fetch('https://cloud-worker.wongkiinging.workers.dev/stop', {
      method: 'POST',
    });
  
    const text = await response.text();
    document.getElementById('status-indicator').innerText = text.includes("OFF") ? "OFF" : "ON";
  });
  
  // Fetch temperature data every 3 seconds
  async function fetchTemperature() {
    try {
      const response = await fetch('https://cloud-worker.wongkiinging.workers.dev/temp');
      const data = await response.json();
  
      document.getElementById('rtd-temp').innerText = data.rtd_temp?.toFixed(2);
      document.getElementById('thermo-temp').innerText = data.thermo_temp;
      document.getElementById('internal-temp').innerText = data.internal_temp;
      document.getElementById('last-update').innerText = data.last_update;
    } catch (err) {
      console.error('Failed to fetch temperature:', err);
    }
  }
  
  setInterval(fetchTemperature, 3000);
  fetchTemperature();
  