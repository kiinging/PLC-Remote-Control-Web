const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://plc-web.online',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Handle preflight OPTIONS request
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // ------------------ Get Current Setpoint ------------------
    if (url.pathname === '/setpoint_status') {
      const response = await fetch("https://orangepi.plc-web.online/setpoint_status");
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // ------------------ Get Current mv ------------------
    if (url.pathname === '/mv_status') {
      const response = await fetch("https://orangepi.plc-web.online/mv_status");
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // ------------------ Get Current PID Params ------------------
    if (url.pathname === '/pid_status') {
      const response = await fetch("https://orangepi.plc-web.online/pid_status");
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // ------------------ Get Control Status Params ------------------
    if (url.pathname === '/control_status') {
      const response = await fetch("https://orangepi.plc-web.online/control_status");
      const data = await response.text();
      return new Response(data, {
        status: response.status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    }


    // ------------------ Light Control ------------------
    if (url.pathname === '/start_light') {
      const response = await fetch("https://orangepi.plc-web.online/light/on", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // Control light OFF
    if (url.pathname === '/stop_light') {
      const response = await fetch("https://orangepi.plc-web.online/light/off", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // ------------------ Web Control ------------------
    // Control Web ON
    if (url.pathname === '/start_web') {
      const response = await fetch("https://orangepi.plc-web.online/web/on", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // Control Web OFF
    if (url.pathname === '/stop_web') {
      const response = await fetch("https://orangepi.plc-web.online/web/off", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }


    // ------------------ PLC Control ------------------
    if (url.pathname === '/start_plc') {
      const response = await fetch("https://orangepi.plc-web.online/plc/on", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    if (url.pathname === '/stop_plc') {
      const response = await fetch("https://orangepi.plc-web.online/plc/off", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // ------------------ Mode Control ------------------
    if (url.pathname === '/manual_mode') {
      const response = await fetch("https://orangepi.plc-web.online/mode/manual", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    if (url.pathname === '/auto_mode') {
      const response = await fetch("https://orangepi.plc-web.online/mode/auto", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }


    // ------------------ Temperature ------------------
    if (url.pathname === '/temp') {
      const response = await fetch("https://orangepi.plc-web.online/temp");
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // ------------------ Video Feed ------------------
    // Get Video video_feed (supports ?t=timestamp)
    if (url.pathname === '/video_feed') {
      const backendSnapshotUrl = "https://cam.plc-web.online/video_feed";
      const response = await fetch(backendSnapshotUrl); // we don't forward `?t`, just use it to bypass browser cache
      return new Response(response.body, {
        status: response.status,
        headers: { 'Content-Type': 'multipart/x-mixed-replace; boundary=frame' },
      });
    }

    // ------------------ Trend Data ------------------
    // Get trend data (PV + MV time series)
    if (url.pathname === '/trend') {
      const response = await fetch("https://orangepi.plc-web.online/trend");
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    // ------------------ PID & Setpoint ------------------
    if (url.pathname === '/setpoint' && request.method === 'POST') {
      const body = await request.json();
      const response = await fetch("https://orangepi.plc-web.online/setpoint", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    if (url.pathname === '/pid' && request.method === 'POST') {
      const body = await request.json();
      const response = await fetch("https://orangepi.plc-web.online/pid", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }
    
    if (url.pathname === '/mv' && request.method === 'POST') {
      const body = await request.json();
      const response = await fetch("https://orangepi.plc-web.online/mv", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return new Response(await response.text(), {
        status: response.status,
        headers: corsHeaders,
      });
    }
    
    // If no route matched, return 404
    return new Response('Not Found', { status: 404 });
  }
};
