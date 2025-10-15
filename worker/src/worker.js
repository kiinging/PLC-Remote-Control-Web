const corsHeaders = {
  "Access-Control-Allow-Origin": "https://plc-web.online", // restrict to your domain
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Credentials": "true"
};

const SESSION_COOKIE = "plc_session";

function setCookie(value) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function withCors(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, ...extraHeaders }
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
      return withCors(null, 204);
    }

    // ---- PING
    if (url.pathname === "/ping") {
      return new Response("pong from worker");
    }

    // ---- LOGIN
    if (url.pathname === "/api/login" && request.method === "POST") {
      const { username, password } = await request.json();
      const storedPass = await env.USERS.get(username);

      if (!storedPass) return withCors("Invalid user", 401);
      if (storedPass !== password) return withCors("Invalid password", 401);

      const token = crypto.randomUUID();
      await env.USERS.put(`session:${token}`, username, { expirationTtl: 7200 });

      return withCors(JSON.stringify({ ok: true }), 200, {
        "Content-Type": "application/json",
        "Set-Cookie": setCookie(token)
      });

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

      return withCors(JSON.stringify({ ok: true }), 200, {
        "Content-Type": "application/json",
        "Set-Cookie": "plc_session=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Lax"
      });
    }




    // ---- SESSION STATUS (optional, for frontend AJAX check)
    if (url.pathname === "/api/session" && request.method === "GET") {
      const session = await validateSession(request, env);
      if (!session) return withCors("Unauthorized", 401);
      return Response.json({ user: session.user }, { headers: corsHeaders });
    }

    // ---- ROOT & DASHBOARD
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
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/mv_manual_status") {
      const r = await fetch("https://orangepi.plc-web.online/mv_manual_status");
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/pid_params") {
      const r = await fetch("https://orangepi.plc-web.online/pid_params");
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/control_status") {
      const r = await fetch("https://orangepi.plc-web.online/control_status");
      return withCors(await r.text(), r.status, { "Content-Type": "application/json" });
    }

    if (url.pathname === "/start_light") {
      const r = await fetch("https://orangepi.plc-web.online/light/on", { method: "POST" });
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/stop_light") {
      const r = await fetch("https://orangepi.plc-web.online/light/off", { method: "POST" });
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/start_web") {
      const r = await fetch("https://orangepi.plc-web.online/web/on", { method: "POST" });
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/stop_web") {
      const r = await fetch("https://orangepi.plc-web.online/web/off", { method: "POST" });
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/start_plc") {
      const r = await fetch("https://orangepi.plc-web.online/plc/on", { method: "POST" });
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/stop_plc") {
      const r = await fetch("https://orangepi.plc-web.online/plc/off", { method: "POST" });
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/manual_mode") {
      const r = await fetch("https://orangepi.plc-web.online/mode/manual", { method: "POST" });
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/auto_mode") {
      const r = await fetch("https://orangepi.plc-web.online/mode/auto", { method: "POST" });
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/tune_mode") {
      const r = await fetch("https://orangepi.plc-web.online/mode/tune", { method: "POST" });
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/temp") {
      const r = await fetch("https://orangepi.plc-web.online/temp");
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/video_feed") {
      const r = await fetch("https://cam.plc-web.online/video_feed");
      return new Response(r.body, {
        status: r.status,
        headers: { ...corsHeaders, "Content-Type": "multipart/x-mixed-replace; boundary=frame" }
      });
    }

    if (url.pathname === "/trend") {
      const r = await fetch("https://orangepi.plc-web.online/trend");
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/setpoint" && request.method === "POST") {
      const body = await request.json();
      const r = await fetch("https://orangepi.plc-web.online/setpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return withCors(await r.text(), r.status);
    }

    // ✅ NEW: Setpoint Acknowledgement
    if (url.pathname === "/setpoint_ack" && request.method === "GET") {
      const r = await fetch("https://orangepi.plc-web.online/setpoint_ack");
      return withCors(await r.text(), r.status, { "Content-Type": "application/json" });
    }

    if (url.pathname === "/pid" && request.method === "POST") {
      const body = await request.json();
      const r = await fetch("https://orangepi.plc-web.online/pid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return withCors(await r.text(), r.status);
    }

    if (url.pathname === "/pid_ack" && request.method === "GET") {
      const r = await fetch("https://orangepi.plc-web.online/pid_ack");
      return withCors(await r.text(), r.status, { "Content-Type": "application/json" });
    }

 
    if (url.pathname === "/mv_manual" && request.method === "POST") {
      const body = await request.json();
      const r = await fetch("https://orangepi.plc-web.online/mv_manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return withCors(await r.text(), r.status);
    }

    // ---- Manual MV Acknowledgement ----
    if (url.pathname === "/mv_manual_ack") {
      const r = await fetch("https://orangepi.plc-web.online/mv_manual_ack");
      return withCors(await r.text(), r.status, { "Content-Type": "application/json" });
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
      return withCors(await r.text(), r.status);
    }

    // ---- Tune Setpoint Acknowledgement ----
    if (url.pathname === "/tune_setpoint_ack" && request.method === "GET") {
      const r = await fetch("https://orangepi.plc-web.online/tune_setpoint_ack");
      return withCors(await r.text(), r.status, { "Content-Type": "application/json" });
    }

    // ---- Start Auto-Tune ----
    if (url.pathname === "/tune_start" && request.method === "POST") {
      const r = await fetch("https://orangepi.plc-web.online/tune_start", { method: "POST" });
      return withCors(await r.text(), r.status);
    }

    // ---- Stop Auto-Tune ----
    if (url.pathname === "/tune_stop" && request.method === "POST") {
      const r = await fetch("https://orangepi.plc-web.online/tune_stop", { method: "POST" });
      return withCors(await r.text(), r.status);
    }

    // ---- Poll Auto-Tune Status ----
    if (url.pathname === "/tune_status" && request.method === "GET") {
      const r = await fetch("https://orangepi.plc-web.online/tune_status");
      return withCors(await r.text(), r.status, { "Content-Type": "application/json" });
    }


    // ---- Default: serve static files
    return env.ASSETS.fetch(request);
  }
};
