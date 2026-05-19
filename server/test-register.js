const http = require('http');

const data = JSON.stringify({ name: 'Debug', email: 'debugtest99@example.com', password: 'Test@1234' });

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/auth/register/initiate',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
};

const req = http.request(options, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', body);
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(data);
req.end();
