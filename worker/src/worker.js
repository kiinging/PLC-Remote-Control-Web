const corsHeaders = {
  "Access-Control-Allow-Origin": "https://plc-web.online",
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

async function serveStaticAsset(request, env, path) {
  const res = await env.ASSETS.fetch(request);
  if (!res || res.status === 404) {
    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }
  return new Response(res.body, {
    status: res.status,
    headers: { ...Object.fromEntries(res.headers), ...corsHeaders }
  });
}

// ---------------- LOGIN HANDLER (new, clean) ----------------
async function handleLogin(request, env) {
  const { username, password } = await request.json();
  const userData = await env.USERS.get(`user:${username}`);
  if (!userData) return withCors("Invalid user", 401);

  const { password: storedPass } = JSON.parse(userData);
  if (storedPass !== password) return withCors("Invalid password", 401);

  const token = crypto.randomUUID();
  await env.USERS.put(`session:${token}`, username, { expirationTtl: 3600 });

  return withCors("OK", 200, { "Set-Cookie": setCookie(token) });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. CORS preflight
    if (request.method === "OPTIONS") return withCors(null, 204);

    // 2. Login
    if (url.pathname === "/api/login" && request.method === "POST") {
      return handleLogin(request, env);
    }

    // 3. Root → check session → redirect or index.html
    if (url.pathname === "/") {
      const cookie = request.headers.get("Cookie") || "";
      const match = cookie.match(/plc_session=([^;]+)/);

      if (!match) return Response.redirect("https://plc-web.online/login.html", 302);

      const token = match[1];
      const sessionUser = await env.USERS.get(`session:${token}`);
      if (!sessionUser) return Response.redirect("https://plc-web.online/login.html", 302);

      return serveStaticAsset(request, env, "index.html");
    }

    // 4. Default: serve static
    return serveStaticAsset(request, env, url.pathname.slice(1));
  }
};
