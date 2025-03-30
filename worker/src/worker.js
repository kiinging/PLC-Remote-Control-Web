export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/start") {
      return new Response(JSON.stringify({ message: "PLC Started" }), { status: 200 });
    } 
    
    if (url.pathname === "/stop") {
      return new Response(JSON.stringify({ message: "PLC Stopped" }), { status: 200 });
    }

    // Default response for other routes
    return new Response("Hello, World!", {
      headers: { "Content-Type": "text/plain" },
    });
  },
};
