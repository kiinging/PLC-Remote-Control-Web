const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const statusIndicator = document.getElementById("status-indicator");

// Replace with your Cloudflare Worker API URL
const WORKER_API = "https://your-worker-name.workers.dev/";

async function sendCommand(command) {
    try {
        const response = await fetch(WORKER_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: command })
        });

        const data = await response.json();
        statusIndicator.textContent = data.status.toUpperCase();
        statusIndicator.style.color = data.status === "on" ? "green" : "red";

    } catch (error) {
        console.error("Error:", error);
    }
}

startBtn.addEventListener("click", () => sendCommand("start"));
stopBtn.addEventListener("click", () => sendCommand("stop"));
