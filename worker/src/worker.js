const corsHeaders = {
  "Access-Control-Allow-Origin": "https://plc-web.online", // ✅ restrict to your domain
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Credentials": "true" // ✅ allow cookies/sessions
};
const SESSION_COOKIE = "plc_session";

function setCookie(value) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

// ✅ Helper: always attach CORS
function withCors(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: { ...corsHeaders, ...extraHeaders }
  });
}

// Serve static assets from /public
async function serveStaticAsset(env, path) {
  const res = await env.ASSETS.fetch(new Request(`https://fake/${path}`));

  if (!res || res.status === 404) {
    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }

  // ✅ Preserve original headers but inject CORS
  return new Response(res.body, {
    status: res.status,
    headers: { ...Object.fromEntries(res.headers), ...corsHeaders }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // ---- OPTIONS (CORS preflight) ----
    if (request.method === "OPTIONS") {
      return withCors(null, 204);
    }

    // ---- LOGIN ----
    if (url.pathname === "/api/login" && request.method === "POST") {
      const { username, password } = await request.json();
      const userData = await env.USERS.get(`user:${username}`);
      if (!userData) return withCors("Invalid user", 401);

      const { password: storedPass } = JSON.parse(userData);
      if (storedPass !== password) return withCors("Invalid password", 401);

      const token = crypto.randomUUID();
      await env.USERS.put(`session:${token}`, username, { expirationTtl: 3600 });

      return withCors("OK", 200, { "Set-Cookie": setCookie(token) });
    }

    // ---- ROOT PAGE ----
    if (url.pathname === "/") {
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(/plc_session=([^;]+)/);

      if (!match) {
        // ⬅️ redirect to login.html if no session
        return Response.redirect("https://plc-web.online/login.html", 302);
      }

      const token = match[1];
      const sessionUser = await env.USERS.get(`session:${token}`);
      if (!sessionUser) {
        // ⬅️ redirect to login.html if invalid session
        return Response.redirect("https://plc-web.online/login.html", 302);
      }

      // valid session → serve index.html
      return serveStaticAsset(env, "index.html");
    }


    // ---- SESSION CHECK for PLC routes ----
    if (
      url.pathname.startsWith("/control") ||
      url.pathname.startsWith("/start") ||
      url.pathname.startsWith("/stop") ||
      url.pathname.startsWith("/setpoint") ||
      url.pathname.startsWith("/pid") ||
      url.pathname.startsWith("/mv_manual") ||
      url.pathname.startsWith("/manual_mode") ||
      url.pathname.startsWith("/auto_mode") ||
      url.pathname.startsWith("/temp") ||
      url.pathname.startsWith("/trend")
    ) {
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(/plc_session=([^;]+)/);
      if (!match) return serveStaticAsset(env, "login.html");

      const token = match[1];
      const sessionUser = await env.USERS.get(`session:${token}`);
      if (!sessionUser) return serveStaticAsset(env, "login.html");

      // Refresh session TTL
      await env.USERS.put(`session:${token}`, sessionUser, { expirationTtl: 3600 });
    }

    // ---- Your PLC routes below ----  
    if (url.pathname === "/setpoint_status") {
      const response = await fetch("https://orangepi.plc-web.online/setpoint_status");
      return withCors(await response.text(), response.status);
    }

    if (url.pathname === "/mv_manual_status") {
      const response = await fetch("https://orangepi.plc-web.online/mv_manual_status");
      return withCors(await response.text(), response.status);
    }

    if (url.pathname === "/pid_status") {
      const response = await fetch("https://orangepi.plc-web.online/pid_status");
      return withCors(await response.text(), response.status);
    }

    if (url.pathname === "/control_status") {
      const response = await fetch("https://orangepi.plc-web.online/control_status");
      return withCors(await response.text(), response.status, {
        "Content-Type": "application/json"
      });
    }

    // ------------------ Light Control ------------------
    if (url.pathname === "/start_light") {
      const response = await fetch("https://orangepi.plc-web.online/light/on", { method: "POST" });
      return withCors(await response.text(), response.status);
    }

    if (url.pathname === "/stop_light") {
      const response = await fetch("https://orangepi.plc-web.online/light/off", { method: "POST" });
      return withCors(await response.text(), response.status);
    }

    // ------------------ Web Control ------------------
    if (url.pathname === "/start_web") {
      const response = await fetch("https://orangepi.plc-web.online/web/on", { method: "POST" });
      return withCors(await response.text(), response.status);
    }

    if (url.pathname === "/stop_web") {
      const response = await fetch("https://orangepi.plc-web.online/web/off", { method: "POST" });
      return withCors(await response.text(), response.status);
    }

    // ------------------ PLC Control ------------------
    if (url.pathname === "/start_plc") {
      const response = await fetch("https://orangepi.plc-web.online/plc/on", { method: "POST" });
      return withCors(await response.text(), response.status);
    }

    if (url.pathname === "/stop_plc") {
      const response = await fetch("https://orangepi.plc-web.online/plc/off", { method: "POST" });
      return withCors(await response.text(), response.status);
    }

    // ------------------ Mode Control ------------------
    if (url.pathname === "/manual_mode") {
      const response = await fetch("https://orangepi.plc-web.online/mode/manual", { method: "POST" });
      return withCors(await response.text(), response.status);
    }

    if (url.pathname === "/auto_mode") {
      const response = await fetch("https://orangepi.plc-web.online/mode/auto", { method: "POST" });
      return withCors(await response.text(), response.status);
    }

    // ------------------ Temperature ------------------
    if (url.pathname === "/temp") {
      const response = await fetch("https://orangepi.plc-web.online/temp");
      return withCors(await response.text(), response.status);
    }

    // ------------------ Video Feed ------------------
    if (url.pathname === "/video_feed") {
      const backendSnapshotUrl = "https://cam.plc-web.online/video_feed";
      const response = await fetch(backendSnapshotUrl);
      return new Response(response.body, {
        status: response.status,
        headers: { 
          ...corsHeaders,
          "Content-Type": "multipart/x-mixed-replace; boundary=frame"
        }
      });
    }

    // ------------------ Trend Data ------------------
    if (url.pathname === "/trend") {
      const response = await fetch("https://orangepi.plc-web.online/trend");
      return withCors(await response.text(), response.status);
    }

    // ------------------ PID & Setpoint ------------------
    if (url.pathname === "/setpoint" && request.method === "POST") {
      const body = await request.json();
      const response = await fetch("https://orangepi.plc-web.online/setpoint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return withCors(await response.text(), response.status);
    }

    if (url.pathname === "/pid" && request.method === "POST") {
      const body = await request.json();
      const response = await fetch("https://orangepi.plc-web.online/pid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return withCors(await response.text(), response.status);
    }

    if (url.pathname === "/mv_manual" && request.method === "POST") {
      const body = await request.json();
      const response = await fetch("https://orangepi.plc-web.online/mv_manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      return withCors(await response.text(), response.status);
    }

        // ---- Default: serve static or 404 ----
    return serveStaticAsset(env, url.pathname.slice(1) || "index.html");
  }
};
