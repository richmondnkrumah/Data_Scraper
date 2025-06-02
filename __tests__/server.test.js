const request = require('supertest');
const app = require('../src/server');

describe('Server', () => {
    test('Health check endpoint should return 200', async () => {
        const response = await request(app)
            .get('/api/health')
            .expect(200);
        
        expect(response.body).toHaveProperty('message', 'OK');
        expect(response.body).toHaveProperty('uptime');
        expect(response.body).toHaveProperty('timestamp');
    });

    test('Should handle 404 for unknown routes', async () => {
        const response = await request(app)
            .get('/api/unknown-route')
            .expect(404);
    });
}); 
