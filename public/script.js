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

