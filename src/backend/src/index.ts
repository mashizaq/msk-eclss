import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import { createServer } from 'http';
import { initMQTT } from './mqtt/mqtt-client';
import { initInfluxDB } from './db/influx-client';
import { setupRoutes } from './api/routes';
import { startControlEngine } from './services/control-engine';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
const server = createServer(app);
const wss = new WebSocket.Server({ server });

// Middleware
app.use(cors());
app.use(express.json());

// WebSocket connections for real-time telemetry
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
  logger.info('WebSocket client connected');
  clients.add(ws);

  ws.on('message', (data) => {
    logger.debug('Received WebSocket message', { data: data.toString() });
  });

  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
    clients.delete(ws);
  });

  ws.on('error', (error) => {
    logger.error('WebSocket error', { error: error.message });
  });
});

// Broadcast telemetry to all connected clients
export function broadcastTelemetry(data: any) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Initialize services
async function bootstrap() {
  try {
    logger.info('🚀 Starting ECLSS Backend');

    // Initialize InfluxDB
    await initInfluxDB();
    logger.info('✅ InfluxDB connected');

    // Initialize MQTT
    await initMQTT(clients, broadcastTelemetry);
    logger.info('✅ MQTT broker connected');

    // Setup API routes
    setupRoutes(app);
    logger.info('✅ API routes initialized');

    // Start control engine
    startControlEngine();
    logger.info('✅ Control engine started');

    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`🌐 Server listening on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Bootstrap failed', { error });
    process.exit(1);
  }
}

bootstrap();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
