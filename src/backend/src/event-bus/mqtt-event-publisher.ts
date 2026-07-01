import mqtt, { MqttClient } from 'mqtt';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

interface MQTTEventMessage {
  timestamp: number;
  source: string;
  topic: string;
  data: any;
  metadata?: Record<string, any>;
}

interface PublishOptions {
  qos?: 0 | 1 | 2;
  retain?: boolean;
  timeout?: number;
}

export class MQTTEventPublisher extends EventEmitter {
  private client: MqttClient;
  private isConnected: boolean = false;
  private messageQueue: Array<{ topic: string; payload: MQTTEventMessage; options: PublishOptions }> = [];
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 20;
  private reconnectDelay: number = 1000; // Start with 1 second

  constructor(brokerUrl: string = 'mqtt://localhost:1883') {
    super();
    this.client = mqtt.connect(brokerUrl, {
      clientId: `eclss-publisher-${Date.now()}`,
      clean: true,
      reconnectPeriod: this.reconnectDelay,
      keepalive: 60,
      connectTimeout: 30 * 1000,
      // Prevent blocking
      writePacketQueueHighWaterMark: 1000,
      outgoingPacketQueueHighWaterMark: 1000,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('✅ MQTT Publisher connected to broker');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.emit('connected');

      // Flush queued messages
      this.flushMessageQueue();
    });

    this.client.on('disconnect', () => {
      logger.warn('⚠️ MQTT Publisher disconnected');
      this.isConnected = false;
      this.emit('disconnected');
    });

    this.client.on('error', (error) => {
      logger.error('MQTT Publisher error', { error: error.message });
      this.emit('error', error);
    });

    this.client.on('offline', () => {
      logger.warn('MQTT Publisher offline');
      this.emit('offline');
    });

    this.client.on('reconnect', () => {
      this.reconnectAttempts++;
      logger.info('MQTT Publisher reconnecting', { attempt: this.reconnectAttempts });

      // Exponential backoff with jitter
      this.reconnectDelay = Math.min(
        1000 * Math.pow(1.5, this.reconnectAttempts) + Math.random() * 1000,
        32000
      );
    });
  }

  /**
   * Non-blocking publish - returns immediately without waiting for broker ack
   */
  async publish(
    topic: string,
    data: any,
    options: PublishOptions = { qos: 1, retain: false }
  ): Promise<void> {
    const message: MQTTEventMessage = {
      timestamp: Date.now(),
      source: 'eclss_backend',
      topic,
      data,
    };

    const payload = JSON.stringify(message);

    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        logger.debug('Publisher not connected, queuing message', { topic });
        this.messageQueue.push({ topic, payload: message, options });
        resolve(); // Non-blocking: return immediately
        return;
      }

      // Non-blocking publish: don't wait for callback
      this.client.publish(topic, payload, { qos: options.qos || 1, retain: options.retain }, (error) => {
        if (error) {
          logger.error('MQTT publish error', { topic, error: error.message });
          // Re-queue on error
          this.messageQueue.push({ topic, payload: message, options });
          this.emit('publish_error', { topic, error });
        } else {
          logger.debug('Message published (non-blocking)', { topic });
          this.emit('published', { topic, message });
        }
      });

      // Return immediately without waiting
      resolve();
    });
  }

  /**
   * Publish telemetry data (convenience method)
   */
  async publishTelemetry(
    system: string,
    metric: string,
    value: number,
    unit?: string
  ): Promise<void> {
    const topic = `eclss/${system}/${metric}`;
    return this.publish(topic, {
      value,
      unit: unit || 'SI',
      status: 'nominal',
      confidence: 0.99,
    });
  }

  /**
   * Publish alert (high priority)
   */
  async publishAlert(severity: 'low' | 'medium' | 'high' | 'critical', message: string, context?: any): Promise<void> {
    const topic = `ngina/alerts/${severity}`;
    return this.publish(
      topic,
      {
        message,
        context,
        alert_time: Date.now(),
      },
      { qos: 2, retain: false } // QoS 2 for alerts
    );
  }

  /**
   * Publish command (high priority)
   */
  async publishCommand(target: string, command: string, args?: any): Promise<void> {
    const topic = `control/commands/${target}/${command}`;
    return this.publish(
      topic,
      {
        target,
        command,
        args: args || {},
        issued_at: Date.now(),
      },
      { qos: 2, retain: false }
    );
  }

  /**
   * Subscribe to a topic (for confirmation of published messages)
   */
  subscribe(topic: string, callback: (message: MQTTEventMessage) => void): void {
    this.client.subscribe(topic, { qos: 1 }, (error) => {
      if (error) {
        logger.error('Subscribe error', { topic, error: error.message });
      } else {
        logger.debug('Subscribed to topic', { topic });
      }
    });

    this.client.on('message', (receivedTopic, payload) => {
      if (receivedTopic === topic) {
        try {
          const message = JSON.parse(payload.toString());
          callback(message);
        } catch (error) {
          logger.error('Failed to parse MQTT message', { topic, error });
        }
      }
    });
  }

  /**
   * Flush queued messages after reconnection
   */
  private async flushMessageQueue(): Promise<void> {
    logger.info('Flushing queued messages', { count: this.messageQueue.length });

    while (this.messageQueue.length > 0 && this.isConnected) {
      const { topic, payload, options } = this.messageQueue.shift()!;

      this.client.publish(JSON.stringify(payload), topic, { qos: options.qos || 1 }, (error) => {
        if (error) {
          logger.error('Failed to flush queued message', { topic, error });
          // Re-queue if failed
          this.messageQueue.unshift({ topic, payload, options });
        }
      });

      // Small delay to avoid overwhelming broker
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  /**
   * Get publisher health status
   */
  getHealth(): {
    connected: boolean;
    reconnect_attempts: number;
    queued_messages: number;
  } {
    return {
      connected: this.isConnected,
      reconnect_attempts: this.reconnectAttempts,
      queued_messages: this.messageQueue.length,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down MQTT Publisher');
    return new Promise((resolve) => {
      this.client.end(true, {}, () => {
        logger.info('MQTT Publisher closed');
        resolve();
      });
    });
  }
}

export const mqttPublisher = new MQTTEventPublisher(process.env.MQTT_URL);
