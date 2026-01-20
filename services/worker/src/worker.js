let relayState = false;
let radxaAlive = false;
let lastRadxaPing = 0;
let lastRelayOn = 0;

const allowedOrigins = [
  "https://plc-web.online",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  if (allowedOrigins.includes(origin)) {
    return {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Credentials": "true"
    };
  }
  return {
    "Access-Control-Allow-Origin": "https://plc-web.online",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true"
  };
}

const SESSION_COOKIE = "plc_session";


function setCookie(value) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function withCors(request, body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { ...getCorsHeaders(request), ...extraHeaders }
  });
}

async function validateSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/plc_session=([^;]+)/);
  if (!match) return null;

  const token = match[1];
  const sessionUser = await env.USERS.get(`session:${token}`);
  if (!sessionUser) return null;

  // refresh TTL
  await env.USERS.put(`session:${token}`, sessionUser, { expirationTtl: 7200 });
  return { user: sessionUser };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ---- OPTIONS (CORS preflight)
    if (request.method === "OPTIONS") {
      return withCors(request, null, 204);
    }

    // ---- PING
    if (url.pathname === "/ping") {
      return new Response("pong from worker");
    }

    // ---- LOGIN
    if (url.pathname === "/api/login" && request.method === "POST") {
      const { username, password } = await request.json();
      const storedPass = await env.USERS.get(username);

      if (!storedPass) return withCors(request, "Invalid user", 401);
      if (storedPass !== password) return withCors(request, "Invalid password", 401);

      const token = crypto.randomUUID();
      await env.USERS.put(`session:${token}`, username, { expirationTtl: 7200 });

      return withCors(request, JSON.stringify({ ok: true }), 200, {
        "Content-Type": "application/json",
        "Set-Cookie": setCookie(token)
      });

    }

    // ---- SIGNUP
    if (url.pathname === "/api/signup" && request.method === "POST") {
      const { username, password } = await request.json();

      // Simple validation
      if (!username || !password) return withCors(request, "Missing fields", 400);

      // Check if user exists
      const existing = await env.USERS.get(username);
      if (existing) return withCors(request, "User already exists", 409);

      // Create user
      await env.USERS.put(username, password);

      return withCors(request, JSON.stringify({ ok: true }), 201, {
        "Content-Type": "application/json"
      });
    }

    // ---- LIST USERS (Admin)
    if (url.pathname === "/api/users" && request.method === "GET") {
      const session = await validateSession(request, env);
      if (!session) return withCors(request, "Unauthorized", 401);

      // (Optional) Add role check here if "admin" stored in session
      // For now, allow any logged-in user to see list (for simplicity) or restrict to specific usernames
      // if (session.user !== 'admin') return withCors(request, "Forbidden", 403);

      const list = await env.USERS.list();
      const users = list.keys.map(k => k.name).filter(n => !n.startsWith("session:"));

      return withCors(request, JSON.stringify({ users }), 200, {
        "Content-Type": "application/json"
      });
    }

    // ---- DELETE USER (Admin)
    if (url.pathname === "/api/user/delete" && request.method === "POST") {
      const session = await validateSession(request, env);
      if (!session) return withCors(request, "Unauthorized", 401);
      // if (session.user !== 'admin') return withCors(request, "Forbidden", 403);

      const { username } = await request.json();
      await env.USERS.delete(username);
      return withCors(request, JSON.stringify({ ok: true }), 200, { "Content-Type": "application/json" });
    }

    // ---- LOGOUT
    if (url.pathname === "/api/logout" && request.method === "POST") {
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(/plc_session=([^;]+)/);

      if (match) {
        const token = match[1];
        try {
          await env.USERS.delete(`session:${token}`);
        } catch (err) {
          console.error("KV delete failed:", err);
        }
      }

      return withCors(request, JSON.stringify({ ok: true }), 200, {
        "Content-Type": "application/json",
        "Set-Cookie": "plc_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax"
      });
    }




    // ---- SESSION STATUS (optional, for frontend AJAX check)
    if (url.pathname === "/api/session" && request.method === "GET") {
      const session = await validateSession(request, env);
      if (!session) return withCors(request, "Unauthorized", 401);
      return Response.json({ user: session.user }, { headers: getCorsHeaders(request) });
    }

    // ---- DASHBOARD ACCESS
    if (url.pathname === "/" || url.pathname === "/dashboard.html") {
      const session = await validateSession(request, env);
      if (!session) {
        return Response.redirect("https://plc-web.online/login.html", 302);
      }
      return env.ASSETS.fetch(new Request("/dashboard.html", request));
    }

    // ---- Proxy routes (no extra checks: cookie already guards dashboard access)
    if (url.pathname === "/setpoint_status") {
      const r = await fetch("https://orangepi.plc-web.online/setpoint_status");
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/mv_manual_status") {
      const r = await fetch("https://orangepi.plc-web.online/mv_manual_status");
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/pid_params") {
      const r = await fetch("https://orangepi.plc-web.online/pid_params");
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/control_status") {
      const r = await fetch("https://orangepi.plc-web.online/control_status");
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    if (url.pathname === "/start_light") {
      const r = await fetch("https://orangepi.plc-web.online/light/on", { method: "POST" });
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/stop_light") {
      const r = await fetch("https://orangepi.plc-web.online/light/off", { method: "POST" });
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/start_web") {
      const r = await fetch("https://orangepi.plc-web.online/web/on", { method: "POST" });
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/stop_web") {
      const r = await fetch("https://orangepi.plc-web.online/web/off", { method: "POST" });
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/start_plc") {
      const r = await fetch("https://orangepi.plc-web.online/plc/on", { method: "POST" });
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/stop_plc") {
      const r = await fetch("https://orangepi.plc-web.online/plc/off", { method: "POST" });
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/manual_mode") {
      const r = await fetch("https://orangepi.plc-web.online/mode/manual", { method: "POST" });
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/auto_mode") {
      const r = await fetch("https://orangepi.plc-web.online/mode/auto", { method: "POST" });
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/tune_mode") {
      const r = await fetch("https://orangepi.plc-web.online/mode/tune", { method: "POST" });
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/temp") {
      const r = await fetch("https://orangepi.plc-web.online/temp");
      return withCors(request, await r.text(), r.status);
    }

    if (url.pathname === "/video_feed") {
      const session = await validateSession(request, env);
      if (!session) return withCors(request, "Unauthorized", 401);

      // Pass Basic Auth credentials (radxa:radxa) to the camera stream
      const authHeader = "Basic " + btoa("radxa:radxa");
      const r = await fetch("https://cam.plc-web.online/video_feed", {
        headers: { "Authorization": authHeader }
      });
      return new Response(r.body, {
        status: r.status,
        headers: { ...getCorsHeaders(request), "Content-Type": "multipart/x-mixed-replace; boundary=frame" }
      });
    }

    if (url.pathname === "/setpoint" && request.method === "POST") {
      const body = await request.json();
      const r = await fetch("https://orangepi.plc-web.online/setpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    // ✅ NEW: Setpoint Acknowledgement
    if (url.pathname === "/setpoint_ack" && request.method === "GET") {
      const r = await fetch("https://orangepi.plc-web.online/setpoint_ack");
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    if (url.pathname === "/pid" && request.method === "POST") {
      const body = await request.json();
      const r = await fetch("https://orangepi.plc-web.online/pid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    if (url.pathname === "/pid_ack" && request.method === "GET") {
      const r = await fetch("https://orangepi.plc-web.online/pid_ack");
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }


    if (url.pathname === "/mv_manual" && request.method === "POST") {
      const body = await request.json();
      const r = await fetch("https://orangepi.plc-web.online/mv_manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    // ---- Manual MV Acknowledgement ----
    if (url.pathname === "/mv_manual_ack") {
      const r = await fetch("https://orangepi.plc-web.online/mv_manual_ack");
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    // -------------------- Auto-Tune Related Routes --------------------
    // ---- Send Tune Setpoint ----
    if (url.pathname === "/tune_setpoint" && request.method === "POST") {
      const body = await request.json();
      const r = await fetch("https://orangepi.plc-web.online/tune_setpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    // ---- Tune Setpoint Acknowledgement ----
    if (url.pathname === "/tune_setpoint_ack" && request.method === "GET") {
      const r = await fetch("https://orangepi.plc-web.online/tune_setpoint_ack");
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    // ---- Start Auto-Tune ----
    if (url.pathname === "/tune_start" && request.method === "POST") {
      const r = await fetch("https://orangepi.plc-web.online/tune_start", { method: "POST" });
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    // ---- Tune Start Acknowledgement ----
    if (url.pathname === "/tune_start_ack" && request.method === "GET") {
      const r = await fetch("https://orangepi.plc-web.online/tune_start_ack");
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    // ---- Stop Auto-Tune ----
    if (url.pathname === "/tune_stop" && request.method === "POST") {
      const r = await fetch("https://orangepi.plc-web.online/tune_stop", { method: "POST" });
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    // ---- Poll Auto-Tune Status ----
    if (url.pathname === "/tune_status" && request.method === "GET") {
      const r = await fetch("https://orangepi.plc-web.online/tune_status");
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    if (url.pathname === "/tune_setpoint_status") {
      const r = await fetch("https://orangepi.plc-web.online/tune_setpoint_status");
      return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
    }

    // ---- RELAY CONTROL (ESP32-S3) ----
    if (url.pathname === "/relay") {
      if (request.method === "POST") {
        const data = await request.json();
        relayState = !!data.relay;

        if (relayState) {
          lastRelayOn = Date.now(); // record when relay turned on
        }

        return withCors(request, JSON.stringify({ ok: true, relay: relayState }), 200, {
          "Content-Type": "application/json"
        });
      }
      if (request.method === "GET") {
        const alive = (Date.now() - lastRadxaPing < 15000);
        const booting = relayState && !alive && (Date.now() - lastRelayOn < 60000);

        return withCors(request, JSON.stringify({ relay: relayState, alive, booting }), 200, {
          "Content-Type": "application/json"
        });
      }
    }

    // ---- RADXA HEARTBEAT ----
    if (url.pathname === "/radxa_heartbeat" && request.method === "POST") {
      lastRadxaPing = Date.now();
      radxaAlive = true;
      return withCors(request, JSON.stringify({ ok: true, time: lastRadxaPing }), 200, {
        "Content-Type": "application/json"
      });
    }
    // ---- WebSocket relay to Orange Pi ----
    if (url.pathname === "/ws") {
      // 👇 Backend WS target (your Orange Pi’s internal websocket)
      const target = "ws://orangepi.plc-web.online:8765";

      // Create WS pair for the browser connection
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Connect to backend
      const backend = new WebSocket(target);

      // Forward messages from backend → browser
      backend.addEventListener("message", (event) => server.send(event.data));

      // Forward messages from browser → backend
      server.addEventListener("message", (event) => backend.send(event.data));

      // Close both ends cleanly
      backend.addEventListener("close", () => server.close());
      backend.addEventListener("error", () => server.close());
      server.addEventListener("close", () => backend.close());

      server.accept();
      return new Response(null, { status: 101, webSocket: client });
    }


    // ---- Default: serve static files
    return env.ASSETS.fetch(request);
  }
};
