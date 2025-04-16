const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://plc-web.online',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Optional delay (for testing)
    // await new Promise(resolve => setTimeout(resolve, 3000));

    // Control LED ON
    if (url.pathname === '/start') {
      const response = await fetch("https://orangepi.plc-web.online/led/on", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // Control LED OFF
    if (url.pathname === '/stop') {
      const response = await fetch("https://orangepi.plc-web.online/led/off", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // Get Temperature
    if (url.pathname === '/temp') {
      const response = await fetch("https://orangepi.plc-web.online/temp");
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // Get Video Snapshot (supports ?t=timestamp)
    if (url.pathname === '/snapshot') {
      const backendSnapshotUrl = "https://zero2w.plc-web.online/snapshot";
      const response = await fetch(backendSnapshotUrl); // we don't forward `?t`, just use it to bypass browser cache
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...corsHeaders,
          'Content-Type': 'image/jpeg',
          'Cache-Control': 'no-store, max-age=0',
        },
      });
    }

    // Handle preflight OPTIONS request
