const workerBase = 'https://cloud-worker.wongkiinging.workers.dev';

let chart; // Global chart instance

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
              borderColor: 'blue',
              yAxisID: 'y',
              tension: 0.3,
            },
            {
              label: 'MV (%)',
              data: mvData,
              borderColor: 'red',
              yAxisID: 'y1',
              tension: 0.3,
            }
          ]
        },
        options: {
          responsive: true,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          stacked: false,
          scales: {
            y: {
              type: 'linear',
              position: 'right',
              min: 0,       // fixed minimum
              max: 150,     // fixed maximum
              title: {
                display: true,
                text: 'PV (°C)'
              },
            },
            y1: {
              type: 'linear',
              position: 'left',
              min: 0,       // fixed minimum
              max: 100,     // fixed maximum
              title: {
                display: true,
                text: 'MV (%)'
              },
              grid: {
                drawOnChartArea: false,
              }
            }
          }
        }
      });
    } else {
      chart.data.labels = labels;
      chart.data.datasets[0].data = pvData;
      chart.data.datasets[1].data = mvData;
      chart.options.scales.y.min = 0;
      chart.options.scales.y.max = 150;
      chart.options.scales.y1.min = 0;
      chart.options.scales.y1.max = 100;
      chart.update();
    }

  } catch (error) {
    console.error("Failed to fetch trend data:", error);
  }
}


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
    document.getElementById('status-indicator').innerText = responseText.includes("ON") ? "ON" : "OFF";

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

setInterval(fetchTrendData, 5000);  // update every 5 seconds
fetchTrendData(); // initial fetch
