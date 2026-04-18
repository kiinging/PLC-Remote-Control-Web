var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// services/worker/src/worker.js
var allowedOrigins = [
  "https://plc-web.online",
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
    "Access-Control-Allow-Origin": "https://plc-web.online",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true"
  };
}
__name(getCorsHeaders, "getCorsHeaders");
var SESSION_COOKIE = "plc_session";
function setCookie(value) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
__name(setCookie, "setCookie");
function withCors(request, body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { ...getCorsHeaders(request), ...extraHeaders }
  });
}
__name(withCors, "withCors");
async function validateSession(request, env) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/plc_session=([^;]+)/);
  if (!match) return null;
  const username = match[1];
  return { user: username };
}
__name(validateSession, "validateSession");
var worker_default = {
  async fetch(request, env, ctx) {
    try {
      const url = new URL(request.url);
      if (request.method === "OPTIONS") {
        return withCors(request, null, 204);
      }
      const spaPageRoutes = [
        "/dashboard",
        "/login",
        "/signup",
        "/admin",
        "/booking",
        "/event-log",
        "/settings",
        "/tune",
        "/about"
      ];
      if (request.method === "GET" && (url.pathname === "/" || spaPageRoutes.some((r) => url.pathname === r || url.pathname.startsWith(r + "/")))) {
        if (env.ASSETS) {
          return env.ASSETS.fetch(new Request("https://plc-web.online/index.html"));
        }
      }
      if (url.pathname === "/api/ping") {
        return new Response("pong from worker");
      }
      if (url.pathname === "/api/debug_env") {
        return new Response(JSON.stringify(Object.keys(env)), {
          headers: { "Content-Type": "application/json" }
        });
      }
      if (url.pathname === "/api/logout" && request.method === "POST") {
        return withCors(request, JSON.stringify({ ok: true }), 200, {
          "Content-Type": "application/json",
          "Set-Cookie": "plc_session=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax"
        });
      }
      if (url.pathname === "/api/auth/exchange" && request.method === "POST") {
        const { access_token, user_email } = await request.json();
        if (!access_token || !user_email) {
          return withCors(request, "Missing token or email", 400);
        }
        return withCors(request, JSON.stringify({ ok: true }), 200, {
          "Content-Type": "application/json",
          "Set-Cookie": setCookie(user_email)
        });
      }
      if (url.pathname === "/api/session" && request.method === "GET") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        return Response.json({ user: session.user }, { headers: getCorsHeaders(request) });
      }
      if (url.pathname === "/api/admin/delete-user" && request.method === "POST") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        const { email } = await request.json();
        if (!email) return withCors(request, "Missing email", 400);
        const adminEmail = env.ADMIN_EMAIL || "wongkiinging@gmail.com";
        if (email === adminEmail) {
          return withCors(request, "Cannot delete admin account", 403);
        }
        const supabaseUrl = env.SUPABASE_URL;
        const serviceKey = env.SUPABASE_SERVICE_KEY;
        if (!serviceKey || !supabaseUrl) {
          return withCors(request, "Server misconfigured: missing Supabase service key", 500);
        }
        try {
          const listResp = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
            headers: {
              "apikey": serviceKey,
              "Authorization": `Bearer ${serviceKey}`
            }
          });
          const listData = await listResp.json();
          const users = listData.users || [];
          const target = users.find((u) => u.email === email);
          if (!target) {
            return withCors(request, JSON.stringify({ ok: false, error: "User not found in Supabase" }), 404, {
              "Content-Type": "application/json"
            });
          }
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
      if (url.pathname === "/api/relay_status" && request.method === "GET") {
        try {
          const r = await fetch("https://orangepi.plc-web.online/relay_status");
          return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
        } catch (e) {
          return withCors(request, JSON.stringify({
            alive: false,
            relay: null,
            last_seen_s: 9999,
            desired: false,
            error: e.message
          }), 200, { "Content-Type": "application/json" });
        }
      }
      if (url.pathname === "/api/light/on" && request.method === "POST") {
        const r = await fetch("https://orangepi.plc-web.online/light/on", { method: "POST" });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/light/off" && request.method === "POST") {
        const r = await fetch("https://orangepi.plc-web.online/light/off", { method: "POST" });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/web/on" && request.method === "POST") {
        const r = await fetch("https://orangepi.plc-web.online/web/on", { method: "POST" });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/web/off" && request.method === "POST") {
        const r = await fetch("https://orangepi.plc-web.online/web/off", { method: "POST" });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/plc/on" && request.method === "POST") {
        const r = await fetch("https://orangepi.plc-web.online/plc/on", { method: "POST" });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/plc/off" && request.method === "POST") {
        const r = await fetch("https://orangepi.plc-web.online/plc/off", { method: "POST" });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname.startsWith("/api/mode/") && request.method === "POST") {
        const backendPath = url.pathname.replace(/^\/api/, "");
        const r = await fetch(`https://orangepi.plc-web.online${backendPath}`, { method: "POST" });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/relay" && request.method === "GET") {
        const r = await fetch("https://orangepi.plc-web.online/relay_status");
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/setpoint_status") {
        const r = await fetch("https://orangepi.plc-web.online/setpoint_status");
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/mv_manual_status") {
        const r = await fetch("https://orangepi.plc-web.online/mv_manual_status");
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/pid_params") {
        const r = await fetch("https://orangepi.plc-web.online/pid_params");
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/control_status") {
        const r = await fetch("https://orangepi.plc-web.online/control_status");
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/start_light") {
        const r = await fetch("https://orangepi.plc-web.online/light/on", { method: "POST" });
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/stop_light") {
        const r = await fetch("https://orangepi.plc-web.online/light/off", { method: "POST" });
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/start_web") {
        const r = await fetch("https://orangepi.plc-web.online/web/on", { method: "POST" });
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/stop_web") {
        const r = await fetch("https://orangepi.plc-web.online/web/off", { method: "POST" });
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/web_ack") {
        const r = await fetch("https://orangepi.plc-web.online/web_ack");
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/start_plc") {
        const r = await fetch("https://orangepi.plc-web.online/plc/on", { method: "POST" });
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/stop_plc") {
        const r = await fetch("https://orangepi.plc-web.online/plc/off", { method: "POST" });
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/manual_mode") {
        const r = await fetch("https://orangepi.plc-web.online/mode/manual", { method: "POST" });
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/auto_mode") {
        const r = await fetch("https://orangepi.plc-web.online/mode/auto", { method: "POST" });
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/tune_mode") {
        const r = await fetch("https://orangepi.plc-web.online/mode/tune", { method: "POST" });
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/temp") {
        const r = await fetch("https://orangepi.plc-web.online/temp");
        return withCors(request, await r.text(), r.status);
      }
      if (url.pathname === "/api/heartbeat" && request.method === "GET") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        try {
          const r = await fetch("https://orangepi.plc-web.online/heartbeat");
          return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
        } catch (e) {
          return withCors(request, JSON.stringify({ status: "offline" }), 503, { "Content-Type": "application/json" });
        }
      }
      if (url.pathname === "/api/camera_health" && request.method === "GET") {
        const session = await validateSession(request, env);
        if (!session) return withCors(request, "Unauthorized", 401);
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 2500);
          const authHeader = "Basic " + btoa("radxa:radxa");
          const r = await fetch("https://cam.plc-web.online/health", {
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
        const authHeader = "Basic " + btoa("radxa:radxa");
        const r = await fetch("https://cam.plc-web.online/video_feed", {
          headers: { "Authorization": authHeader }
        });
        return new Response(r.body, {
          status: r.status,
          headers: { ...getCorsHeaders(request), "Content-Type": "multipart/x-mixed-replace; boundary=frame" }
        });
      }
      if (url.pathname === "/api/setpoint" && request.method === "POST") {
        const body = await request.json();
        const r = await fetch("https://orangepi.plc-web.online/setpoint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/setpoint_ack" && request.method === "GET") {
        const r = await fetch("https://orangepi.plc-web.online/setpoint_ack");
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/pid" && request.method === "POST") {
        const body = await request.json();
        const r = await fetch("https://orangepi.plc-web.online/pid", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/pid_ack" && request.method === "GET") {
        const r = await fetch("https://orangepi.plc-web.online/pid_ack");
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/mv_manual" && request.method === "POST") {
        const body = await request.json();
        const r = await fetch("https://orangepi.plc-web.online/mv_manual", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/mv_manual_ack") {
        const r = await fetch("https://orangepi.plc-web.online/mv_manual_ack");
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/tune_setpoint" && request.method === "POST") {
        const body = await request.json();
        const r = await fetch("https://orangepi.plc-web.online/tune_setpoint", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/tune_setpoint_ack" && request.method === "GET") {
        const r = await fetch("https://orangepi.plc-web.online/tune_setpoint_ack");
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/tune_start" && request.method === "POST") {
        const r = await fetch("https://orangepi.plc-web.online/tune_start", { method: "POST" });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/tune_start_ack" && request.method === "GET") {
        const r = await fetch("https://orangepi.plc-web.online/tune_start_ack");
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/tune_stop" && request.method === "POST") {
        const r = await fetch("https://orangepi.plc-web.online/tune_stop", { method: "POST" });
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/tune_status" && request.method === "GET") {
        const r = await fetch("https://orangepi.plc-web.online/tune_status");
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/tune_setpoint_status") {
        const r = await fetch("https://orangepi.plc-web.online/tune_setpoint_status");
        return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
      }
      if (url.pathname === "/api/trend" && request.method === "GET") {
        const limit = new URL(request.url).searchParams.get("limit") || "900";
        try {
          const r = await fetch(`https://orangepi.plc-web.online/trend?limit=${limit}`);
          return withCors(request, await r.text(), r.status, { "Content-Type": "application/json" });
        } catch (e) {
          return withCors(request, JSON.stringify({ error: e.message }), 503, { "Content-Type": "application/json" });
        }
      }
      if (url.pathname === "/api/relay" && request.method === "POST") {
        try {
          const body = await request.clone().json();
          const gatewayUrl = "https://orangepi.plc-web.online/relay";
          const r = await fetch(gatewayUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
          });
          const respText = await r.text();
          return withCors(request, respText, r.status, { "Content-Type": "application/json" });
        } catch (e) {
          return withCors(request, JSON.stringify({ error: e.message }), 500);
        }
      }
      if (url.pathname === "/api/ws") {
        const target = "ws://orangepi.plc-web.online:8765";
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        const backend = new WebSocket(target);
        backend.addEventListener("message", (event) => server.send(event.data));
        server.addEventListener("message", (event) => backend.send(event.data));
        backend.addEventListener("close", () => server.close());
        backend.addEventListener("error", () => server.close());
        server.addEventListener("close", () => backend.close());
        server.accept();
        return new Response(null, { status: 101, webSocket: client });
      }
      if (env.ASSETS) {
        const response = await env.ASSETS.fetch(request);
        if (response.status === 404 && !url.pathname.startsWith("/api")) {
          return env.ASSETS.fetch(new Request("https://plc-web.online/index.html"));
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
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
