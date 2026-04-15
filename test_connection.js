async function test() {
  try {
    console.log('Testing connection to Cloudflare API using built-in fetch...');
    const response = await fetch('https://api.cloudflare.com/client/v4/ips');
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Success! Received data from Cloudflare.');
  } catch (err) {
    console.error('Fetch Failed:', err.message);
    if (err.cause) console.error('Cause:', err.cause.message);
  }
}
test();
