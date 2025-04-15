const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://plc-web.online',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Simulate delay (optional, can be removed)
    await new Promise(resolve => setTimeout(resolve, 3000));

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

    if (url.pathname === '/video') {
      const response = await fetch("https://zero2w.plc-web.online/video_feed");
      return new Response(response.body, {
        status: response.status,
        headers: {
          ...corsHeaders,
          'Content-Type': response.headers.get('Content-Type') || 'multipart/x-mixed-replace; boundary=frame',
        },
      });
    }
    

    return new Response('Not Found', { status: 404 });
  }
};
