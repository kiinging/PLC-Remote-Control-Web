const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://cloud-ui-4ws.pages.dev',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

addEventListener('fetch', event => {
  const request = event.request;
  if (request.method === 'OPTIONS') {
    // Handle CORS preflight requests
    event.respondWith(handleOptions(request));
  } else {
    event.respondWith(handleRequest(request));
  }
});

async function handleRequest(request) {
  const url = new URL(request.url);
  let response;

  if (url.pathname === '/start') {
    // Handle the /start command
    response = new Response(JSON.stringify({ message: 'PLC Started' }), { status: 200 });
  } else if (url.pathname === '/stop') {
    // Handle the /stop command
    response = new Response(JSON.stringify({ message: 'PLC Stopped' }), { status: 200 });
  } else {
    // Default response for other routes
    response = new Response('Not Found', { status: 404 });
  }

  // Append CORS headers to the response
  const newHeaders = new Headers(response.headers);
  newHeaders.set('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
  newHeaders.set('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
  newHeaders.set('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

function handleOptions(request) {
  return new Response(null, {
    headers: corsHeaders,
  });
}
