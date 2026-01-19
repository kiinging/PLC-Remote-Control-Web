# ESP32-S3 WiFi Relay Controller with Cloudflare Worker Sync and Long-Press Toggle

This project connects an **ESP32-S3 DevKitC-1** to a **2-channel HL-52S relay module**, allowing remote relay control over HTTPS via a **Cloudflare Worker**, with a **local push-button override** (long press for 5 seconds to toggle).

---

## 🔧 Features
- Secure HTTPS communication with Cloudflare Worker (`WiFiClientSecure`)
- Polls cloud state every 5 seconds (`GET /relay`)
- Push-button long-press (≥ 5 seconds) to safely toggle relay locally
- Auto-syncs local state back to cloud via HTTPS `POST /relay`
- Debounce-free (long-press eliminates false triggering)
- Active-LOW relay logic (LOW = ON, HIGH = OFF)

---

## ⚙️ Hardware Setup

| Component | ESP32-S3 Pin | Notes |
|------------|--------------|-------|
| **Relay module IN** | GPIO18 | Active-LOW input |
| **Relay VCC** | 3.3 V *(or 5 V if opto isolated via JD-VCC)* | Power the module logic |
| **Relay GND** | GND | Common ground with ESP |
| **Push button** | GPIO14 → GND | Internal pull-up enabled |
| **Wi-Fi** | 2.4 GHz only | Enter your SSID/password in code |

**Important:**  
Avoid using GPIO 6–11 (flash pins). GPIO18 and GPIO14 are safe general-purpose pins.

---

## 🧠 Logic Summary

| Action | GPIO Output | Relay State | Cloud Update |
|---------|--------------|--------------|---------------|
| Cloud sets `relay=true` | LOW | ON | N/A |
| Cloud sets `relay=false` | HIGH | OFF | N/A |
| Button held ≥ 5 s | Toggle | ON/OFF | POST to `/relay` |

---

## 🌐 Cloudflare Worker API (Example)

Minimal worker logic to store and serve relay state:

```js
let relayState = false;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/relay') {
      return new Response(JSON.stringify({ relay: relayState }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (request.method === 'POST' && url.pathname === '/relay') {
      const body = await request.json();
      relayState = !!body.relay;
      return new Response(JSON.stringify({ ok: true, relay: relayState }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
