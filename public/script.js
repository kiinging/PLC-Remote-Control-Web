const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const statusIndicator = document.getElementById("status-indicator");

// Correct Worker API URL
const WORKER_API = "https://cloud-worker.wongkiinging.workers.dev";

async function sendCommand(command) {
    try {
        const response = await fetch(`${WORKER_API}/${command}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" }
        });

        const data = await response.json();
        statusIndicator.textContent = data.message.toUpperCase();
        statusIndicator.style.color = command === "start" ? "green" : "red";

    } catch (error) {
        console.error("Error:", error);
    }
}

startBtn.addEventListener("click", () => sendCommand("start"));
stopBtn.addEventListener("click", () => sendCommand("stop"));
