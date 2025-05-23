const http = require('http');

// Create a simple server to test MongoDB
const server = http.createServer((req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    if (req.url === '/test-mongodb') {
        // Try connecting to MongoDB through a TCP socket
        const net = require('net');
        const client = new net.Socket();

        client.connect(27017, 'localhost', function () {
            console.log('Connected to MongoDB!');
            res.writeHead(200, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                status: 'success',
                message: 'MongoDB connection successful!'
            }));
            client.destroy();
        });

        client.on('error', function (err) {
            console.error('MongoDB connection error:', err);
            res.writeHead(500, {'Content-Type': 'application/json'});
            res.end(JSON.stringify({
                status: 'error',
                message: 'MongoDB connection failed: ' + err.message
            }));
        });
    } else {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('<html><body><h1>MongoDB Test</h1><p>Visit <a href="/test-mongodb">/test-mongodb</a> to test MongoDB connection</p></body></html>');
    }
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`MongoDB test server running at http://localhost:${PORT}/`);
    console.log(`Visit http://localhost:${PORT}/test-mongodb to test MongoDB connection`);
});