const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://cloud-ui-4ws.pages.dev',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Handle /start (maps to Flask's /led/on)
    if (url.pathname === '/start') {
      const response = await fetch("https://plc-web.online/led/on", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // Handle /stop (maps to Flask's /led/off)
    if (url.pathname === '/stop') {
      const response = await fetch("https://plc-web.online/led/off", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // Default 404 response
    return new Response('Not Found', { status: 404 });
  }
};