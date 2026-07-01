import mqtt, { MqttClient } from 'mqtt';
import { InfluxDB, WriteApi } from '@influxdata/influxdb-client';
import { logger } from '../utils/logger';
import { getInfluxWriteApi } from '../db/influx-client';
import WebSocket from 'ws';

let mqttClient: MqttClient;

const MQTT_URL = process.env.MQTT_URL || 'mqtt://localhost:1883';
const MQTT_TOPICS = [
  'eclss/digesters/temperature',
  'eclss/digesters/pressure',
  'eclss/digesters/ph',
  'eclss/ro/feed_pressure',
  'eclss/ro/permeate_tds',
  'eclss/biogas/volume',
  'eclss/biogas/pressure',
  'eclss/pump/flow_rate',
  'eclss/system/status',
];

export async function initMQTT(
  wsClients: Set<WebSocket>,
  broadcastTelemetry: (data: any) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    mqttClient = mqtt.connect(MQTT_URL, {
      clientId: `eclss-backend-${Date.now()}`,
      clean: true,
      reconnectPeriod: 1000,
    });

    mqttClient.on('connect', () => {
      logger.info('Connected to MQTT broker');

      // Subscribe to all telemetry topics
      MQTT_TOPICS.forEach((topic) => {
        mqttClient.subscribe(topic, (err) => {
          if (err) {
            logger.error(`Failed to subscribe to ${topic}`, { error: err });
          } else {
            logger.debug(`Subscribed to ${topic}`);
          }
        });
      });

      resolve();
    });

    mqttClient.on('message', async (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString());
        const timestamp = data.timestamp || Date.now();

        logger.debug('MQTT message received', { topic, data });

        // Write to InfluxDB
        await writeTelemetryToInfluxDB(topic, data, timestamp);

        // Broadcast to WebSocket clients
        broadcastTelemetry({
          topic,
          data,
          timestamp,
        });
      } catch (error) {
        logger.error('Error processing MQTT message', { topic, error });
      }
    });

    mqttClient.on('error', (error) => {
      logger.error('MQTT error', { error: error.message });
      reject(error);
    });

    mqttClient.on('offline', () => {
      logger.warn('MQTT broker offline');
    });

    mqttClient.on('reconnect', () => {
      logger.info('Attempting to reconnect to MQTT broker');
    });
  });
}

async function writeTelemetryToInfluxDB(
  topic: string,
  data: any,
  timestamp: number
): Promise<void> {
  try {
    const writeApi = getInfluxWriteApi();
    const measurement = parseMeasurementFromTopic(topic);
    const fields = parseFieldsFromData(data);
    const tags = parseTagsFromTopic(topic);

    writeApi.writePoint({
      name: measurement,
      tags,
      fields,
      timestamp,
    });

    await writeApi.flush();
  } catch (error) {
    logger.error('Failed to write telemetry to InfluxDB', { error });
  }
}

function parseMeasurementFromTopic(topic: string): string {
  const parts = topic.split('/');
  return `eclss_${parts[1]}`; // e.g., 'eclss_digesters', 'eclss_ro'
}

function parseTagsFromTopic(topic: string): Record<string, string> {
  const parts = topic.split('/');
  return {
    system: parts[1],
    metric: parts[2],
  };
}

function parseFieldsFromData(data: any): Record<string, number | string | boolean> {
  const fields: Record<string, number | string | boolean> = {};

  if (typeof data === 'object' && data !== null) {
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
        fields[key] = value;
      }
    });
  } else {
    fields.value = data;
  }

  return fields;
}

export function getMQTTClient(): MqttClient {
  return mqttClient;
}

export function publishMQTT(topic: string, payload: any): void {
  mqttClient.publish(topic, JSON.stringify(payload), { qos: 1 }, (error) => {
    if (error) {
      logger.error('Failed to publish MQTT message', { topic, error });
    } else {
      logger.debug('MQTT message published', { topic });
    }
  });
}
