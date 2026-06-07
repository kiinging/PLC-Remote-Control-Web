let relayState = false;
let radxaAlive = false;
let lastRadxaPing = 0;
let lastRelayOn = 0;

const allowedOrigins = [
  "https://pidlab2026.shop",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://hdngzewkkqzzrxxlunfo.supabase.co"
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
    "Access-Control-Allow-Origin": "https://pidlab2026.shop",
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

// Verify the session cookie contains a valid Supabase JWT.
// The cookie value is the raw Supabase access_token set during /api/auth/exchange.
async function validateSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/plc_session=([^;]+)/);
  if (!match) return null;

  const token = match[1];

  // Verify the token is genuine by calling Supabase /auth/v1/user
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        "apikey": env.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${token}`
      }
    });
    if (!res.ok) return null; // Token invalid or expired
    const data = await res.json();
    return { user: data.email || data.id };
  } catch {
    return null; // Network error — deny access
  }
}

// Helper: build gateway headers, always including the shared secret
function gatewayHeaders(env, extra = {}) {
  return {
    "Content-Type": "application/json",
    "X-Worker-Secret": env.GATEWAY_SECRET || "",
    ...extra
  };
}

export default {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);

      // ---- OPTIONS (CORS preflight)
      if (request.method === "OPTIONS") {
        return withCors(request, null, 204);
      }

      // ---- SPA Page Routes (EARLY EXIT): Serve index.html for known client-side routes
      // Must be BEFORE any asset/fallback logic so direct navigation and refresh work.
      // Using a plain new Request() (no second arg) avoids inheriting browser cache headers.
      const spaPageRoutes = [
        "/dashboard", "/login", "/signup", "/admin",
        "/booking", "/event-log", "/settings", "/tune", "/about"
      ];
      if (
        request.method === "GET" &&
        (url.pathname === "/" || spaPageRoutes.some(r => url.pathname === r || url.pathname.startsWith(r + "/")))
      ) {
        if (env.ASSETS) {
          return env.ASSETS.fetch(new Request("https://pidlab2026.shop/index.html"));
        }
      }

      // ---- PING
      if (url.pathname === "/api/ping") {
        return new Response("pong from worker");
      }

      // ---- DEBUG ENV
      if (url.pathname === "/api/debug_env") {
        return new Response(JSON.stringify(Object.keys(env)), {
          headers: { "Content-Type": "application/json" }
        });
      }

      // ---- LOGOUT
      if (url.pathname === "/api/logout" && request.method === "POST") {
        return withCors(request, JSON.stringify({ ok: true }), 200, {
          "Content-Type": "application/json",
          "Set-Cookie": "plc_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax"
        });
      }

      // ---- SUPABASE AUTH EXCHANGE
      // Verifies the JWT with Supabase before issuing a session cookie.
      // Students can sign up with any email + password (no inbox needed) —
      // this only checks the token is cryptographically real, not who owns the email.
      if (url.pathname === "/api/auth/exchange" && request.method === "POST") {
        const { access_token } = await request.json();

        if (!access_token) {
          return withCors(request, "Missing token", 400);
        }

        // Verify the JWT is genuine by calling Supabase
        try {
          const supaRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
            headers: {
              "apikey": env.SUPABASE_ANON_KEY,
              "Authorization": `Bearer ${access_token}`
            }
          });
          if (!supaRes.ok) {
            return withCors(request, JSON.stringify({ ok: false, error: "Invalid token" }), 401, {
              "Content-Type": "application/json"
            });
          }
          const userData = await supaRes.json();
          const userEmail = userData.email || userData.id;

          // Store the raw JWT as the session cookie (validateSession will verify it each request)
          return withCors(request, JSON.stringify({ ok: true, user: userEmail }), 200, {
            "Content-Type": "application/json",
            "Set-Cookie": setCookie(access_token)
          });
        } catch (e) {
          return withCors(request, JSON.stringify({ ok: false, error: e.message }), 500, {
            "Content-Type": "application/json"
          });
        }
      }




      // ---- SESSION STATUS (optional, for frontend AJAX check)
      if (url.pathname === "/api/session" && request.method === "GET") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        return Response.json({ user: session.user }, { headers: getCorsHeaders(request) });
      }

      // ---- ADMIN: Delete Supabase User
      if (url.pathname === "/api/admin/delete-user" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);

        const { email } = await request.json();
        if (!email) return withCors(request, "Missing email", 400);

        // Protect the admin account from self-deletion
        if (email === 'admin@student.local') {
          return withCors(request, "Cannot delete admin account", 403);
        }

        const supabaseUrl = env.SUPABASE_URL;
        const serviceKey = env.SUPABASE_SERVICE_KEY;

        if (!serviceKey || !supabaseUrl) {
          return withCors(request, "Server misconfigured: missing Supabase service key", 500);
        }

        try {
          // Step 1: Find user UUID by email via Admin API
          const listResp = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
            headers: {
              "apikey": serviceKey,
              "Authorization": `Bearer ${serviceKey}`
            }
          });
          const listData = await listResp.json();
          const users = listData.users || [];
          const target = users.find(u => u.email === email);

          if (!target) {
            return withCors(request, JSON.stringify({ ok: false, error: "User not found in Supabase" }), 404, {
              "Content-Type": "application/json"
            });
          }

          // Step 2: Delete the user by UUID
          const delResp = await fetch(`${supabaseUrl}/auth/v1/admin/users/${target.id}`, {
            method: "DELETE",
            headers: {
              "apikey": serviceKey,
              "Authorization": `Bearer ${serviceKey}`
            }
          });

          if (!delResp.ok) {
            const errText = await delResp.text();
            return withCors(request, JSON.stringify({ ok: false, error: errText }), delResp.status, {
              "Content-Type": "application/json"
            });
          }

          return withCors(request, JSON.stringify({ ok: true, deleted: email }), 200, {
            "Content-Type": "application/json"
          });

        } catch (e) {
          return withCors(request, JSON.stringify({ ok: false, error: e.message }), 500, {
            "Content-Type": "application/json"
          });
        }
      }

      // ---- DASHBOARD ACCESS (root handled above in SPA routes; this is kept as fallback)
      // Auth is now fully Supabase-based — no server-side cookie redirect needed.

      // ---- Proxy routes (no extra checks: cookie already guards dashboard access)

      // ✅ Relay Status (Pass-through — read-only, no auth needed)
      if (url.pathname === "/api/relay_status" && request.method === "GET") {
        try {
          const r = await fetch("https://orangepi.pidlab2026.shop/relay_status", {
            headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
          });
          return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
        } catch (e) {
          return withCors(request, JSON.stringify({
            alive: false, relay: null, last_seen_s: 9999, desired: false, error: e.message
          }), 200, { "Content-Type": "application/json" });
        }
      }

      // ✅ Light Control (requires login)
      if (url.pathname === "/api/light/on" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/light/on", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/light/off" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/light/off", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // ✅ Web Control (requires login)
      if (url.pathname === "/api/web/on" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/web/on", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/web/off" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/web/off", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // ✅ PLC Control (requires login)
      if (url.pathname === "/api/plc/on" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/plc/on", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/plc/off" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/plc/off", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // ✅ Mode Control (requires login)
      if (url.pathname.startsWith("/api/mode/") && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const backendPath = url.pathname.replace(/^\/api/, "");
        const r = await fetch(`https://orangepi.pidlab2026.shop${backendPath}`, { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // ✅ Backward Compatibility for GET /api/relay (read-only, no auth)
      if (url.pathname === "/api/relay" && request.method === "GET") {
        const r = await fetch("https://orangepi.pidlab2026.shop/relay_status", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // --- Read-only status endpoints (no auth needed — safe to expose) ---
      if (url.pathname === "/api/setpoint_status") {
        const r = await fetch("https://orangepi.pidlab2026.shop/setpoint_status", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status);
      }

      if (url.pathname === "/api/mv_manual_status") {
        const r = await fetch("https://orangepi.pidlab2026.shop/mv_manual_status", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status);
      }

      if (url.pathname === "/api/pid_params") {
        const r = await fetch("https://orangepi.pidlab2026.shop/pid_params", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status);
      }

      if (url.pathname === "/api/control_status") {
        const r = await fetch("https://orangepi.pidlab2026.shop/control_status", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      if (url.pathname === "/api/web_ack") {
        const r = await fetch("https://orangepi.pidlab2026.shop/web_ack", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      if (url.pathname === "/api/temp") {
        const r = await fetch("https://orangepi.pidlab2026.shop/temp", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status);
      }

      // --- Legacy command aliases (requires login) ---
      if (url.pathname === "/api/start_light") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/light/on", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status);
      }

      if (url.pathname === "/api/stop_light") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/light/off", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status);
      }

      if (url.pathname === "/api/start_web") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/web/on", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status);
      }

      if (url.pathname === "/api/stop_web") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/web/off", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status);
      }

      if (url.pathname === "/api/start_plc") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/plc/on", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status);
      }

      if (url.pathname === "/api/stop_plc") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/plc/off", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status);
      }

      if (url.pathname === "/api/manual_mode") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/mode/manual", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status);
      }

      if (url.pathname === "/api/auto_mode") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/mode/auto", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status);
      }

      if (url.pathname === "/api/tune_mode") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/mode/tune", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status);
      }

      // ---- Gateway Heartbeat ----
      if (url.pathname === "/api/heartbeat" && request.method === "GET") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);

        try {
          const r = await fetch("https://orangepi.pidlab2026.shop/heartbeat");
          return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
        } catch (e) {
          return withCors(request, JSON.stringify({ status: "offline" }), 503, { "Content-Type": "application/json" });
        }
      }

      // ---- Camera Health Check ----
      if (url.pathname === "/api/camera_health" && request.method === "GET") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);

          const authHeader = "Basic " + btoa("radxa:radxa");
          const r = await fetch("https://cam.pidlab2026.shop/health", {
            signal: controller.signal,
            headers: { "Authorization": authHeader }
          });
          clearTimeout(timeoutId);

          return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
        } catch (e) {
          return withCors(request, JSON.stringify({ status: "offline", error: e.message }), 503, { "Content-Type": "application/json" });
        }
      }

      if (url.pathname === "/api/video_feed") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);

        // Pass Basic Auth credentials (radxa:radxa) to the camera stream
        const authHeader = "Basic " + btoa("radxa:radxa");
        const r = await fetch("https://cam.pidlab2026.shop/video_feed", {
          headers: { "Authorization": authHeader }
        });
        return new Response(r.body, {
          status: r.status,
          headers: { ...getCorsHeaders(request), "Content-Type": "multipart/x-mixed-replace; boundary=frame" }
        });
      }

      if (url.pathname === "/api/setpoint" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const body = await request.json();
        const r = await fetch("https://orangepi.pidlab2026.shop/setpoint", {
          method: "POST",
          headers: gatewayHeaders(env),
          body: JSON.stringify(body)
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // ✅ Setpoint Acknowledgement (read-only)
      if (url.pathname === "/api/setpoint_ack" && request.method === "GET") {
        const r = await fetch("https://orangepi.pidlab2026.shop/setpoint_ack", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      if (url.pathname === "/api/pid" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const body = await request.json();
        const r = await fetch("https://orangepi.pidlab2026.shop/pid", {
          method: "POST",
          headers: gatewayHeaders(env),
          body: JSON.stringify(body)
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      if (url.pathname === "/api/pid_ack" && request.method === "GET") {
        const r = await fetch("https://orangepi.pidlab2026.shop/pid_ack", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }


      if (url.pathname === "/api/mv_manual" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const body = await request.json();
        const r = await fetch("https://orangepi.pidlab2026.shop/mv_manual", {
          method: "POST",
          headers: gatewayHeaders(env),
          body: JSON.stringify(body)
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // ---- Manual MV Acknowledgement (read-only) ----
      if (url.pathname === "/api/mv_manual_ack") {
        const r = await fetch("https://orangepi.pidlab2026.shop/mv_manual_ack", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // -------------------- Auto-Tune Related Routes --------------------
      // ---- Send Tune Setpoint (requires login) ----
      if (url.pathname === "/api/tune_setpoint" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const body = await request.json();
        const r = await fetch("https://orangepi.pidlab2026.shop/tune_setpoint", {
          method: "POST",
          headers: gatewayHeaders(env),
          body: JSON.stringify(body)
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // ---- Tune Setpoint Acknowledgement (read-only) ----
      if (url.pathname === "/api/tune_setpoint_ack" && request.method === "GET") {
        const r = await fetch("https://orangepi.pidlab2026.shop/tune_setpoint_ack", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // ---- Start Auto-Tune (requires login) ----
      if (url.pathname === "/api/tune_start" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/tune_start", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // ---- Tune Start Acknowledgement (read-only) ----
      if (url.pathname === "/api/tune_start_ack" && request.method === "GET") {
        const r = await fetch("https://orangepi.pidlab2026.shop/tune_start_ack", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // ---- Stop Auto-Tune (requires login) ----
      if (url.pathname === "/api/tune_stop" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const r = await fetch("https://orangepi.pidlab2026.shop/tune_stop", { method: "POST", headers: gatewayHeaders(env) });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // ---- Poll Auto-Tune Status (read-only) ----
      if (url.pathname === "/api/tune_status" && request.method === "GET") {
        const r = await fetch("https://orangepi.pidlab2026.shop/tune_status", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      if (url.pathname === "/api/tune_setpoint_status") {
        const r = await fetch("https://orangepi.pidlab2026.shop/tune_setpoint_status", {
          headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }

      // ✅ Trend History (time-series buffer — read-only)
      if (url.pathname === "/api/trend" && request.method === "GET") {
        const limit = new URL(request.url).searchParams.get("limit") || "900";
        try {
          const r = await fetch(`https://orangepi.pidlab2026.shop/trend?limit=${limit}`, {
            headers: { "X-Worker-Secret": env.GATEWAY_SECRET || "" }
          });
          return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
        } catch (e) {
          return withCors(request, JSON.stringify({ error: e.message }), 503, { "Content-Type": "application/json" });
        }
      }

      // ============================================
      // RELAY / HEATER Control (PROXIED TO GATEWAY)
      // ============================================
      if (url.pathname === "/api/relay" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        try {
          const body = await request.clone().json();
          const r = await fetch("https://orangepi.pidlab2026.shop/relay", {
            method: "POST",
            headers: gatewayHeaders(env),
            body: JSON.stringify(body)
          });
          const respText = await r.text();
          return withCors(request, respText, r.status, { "Content-Type": "application/json" });
        } catch (e) {
          return withCors(request, JSON.stringify({ error: e.message }), 500);
        }
      }


      // ---- WebSocket relay to Orange Pi ----
      if (url.pathname === "/api/ws") {
        // 👇 Backend WS target (your Orange Pi's internal websocket)
        const target = "ws://orangepi.pidlab2026.shop:8765";

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


      // ---- Default: serve static files (JS, CSS, images, etc.)
      if (env.ASSETS) {
        const response = await env.ASSETS.fetch(request);
        if (response.status === 404 && !url.pathname.startsWith("/api")) {
          // SPA Fallback: serve index.html for any other unknown non-API route
          return env.ASSETS.fetch(new Request("https://pidlab2026.shop/index.html"));
        }
        return response;
      } else {
        return new Response("Not Found", { status: 404 });
      }

    } catch (e) {
      return withCors(request, JSON.stringify({ error: e.message, stack: e.stack }), 500, {
        "Content-Type": "application/json"
      });
    }
  },

  async scheduled(event, env, ctx) {
    // Watchdog logic runs every 10 minutes
    try {
      // 1. Ping the Gateway Heartbeat Endpoint
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

      let isOffline = false;
      try {
        const r = await fetch("https://orangepi.pidlab2026.shop/heartbeat", {
          signal: controller.signal
        });
        if (!r.ok) isOffline = true;
      } catch (e) {
        // Fetch failed (network error, timeout, etc.)
        isOffline = true;
      } finally {
        clearTimeout(timeoutId);
      }

      // 2. Check previous state from KV (using the USERS KV namespace bound to the worker)
      // We store a flag "system:gateway_offline" = "true" or "false"
      const prevState = await env.USERS.get("system:gateway_offline");

      if (isOffline) {
        // If it just went offline, send Telegram alert
        if (prevState !== "true") {
          const botToken = env.TELEGRAM_BOT_TOKEN;
          const chatId = env.TELEGRAM_CHAT_ID;
          
          if (botToken && chatId) {
            const message = "🚨 *Gateway Offline!*\\nYour Lab Gateway at `orangepi.pidlab2026.shop` has stopped responding to heartbeats.";
            const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
            
            await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: "MarkdownV2"
              })
            });
          }
          // Update state so we don't spam
          await env.USERS.put("system:gateway_offline", "true");
        }
      } else {
        // If it's online now, reset the state
        if (prevState === "true") {
          // Optionally, send a "Gateway is back online" message here!
          const botToken = env.TELEGRAM_BOT_TOKEN;
          const chatId = env.TELEGRAM_CHAT_ID;
          if (botToken && chatId) {
            const message = "✅ *Gateway Online!*\\nYour Lab Gateway has reconnected and is sending heartbeats again.";
            const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
            await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: "MarkdownV2"
              })
            });
          }
          await env.USERS.put("system:gateway_offline", "false");
        }
      }
    } catch (e) {
      console.error("Scheduled task failed:", e);
    }
  }
};
