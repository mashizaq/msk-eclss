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

type EventHandler = (message: MQTTEventMessage) => Promise<void>;

export class EventConsumer extends EventEmitter {
  private client: MqttClient;
  private handlers: Map<string, Set<EventHandler>> = new Map();
  private deadLetterQueue: Array<{ topic: string; message: MQTTEventMessage; error: any }> = [];
  private processingMetrics = {
    total_events: 0,
    processed_events: 0,
    failed_events: 0,
    avg_latency_ms: 0,
  };

  constructor(brokerUrl: string = 'mqtt://localhost:1883') {
    super();
    this.client = mqtt.connect(brokerUrl, {
      clientId: `eclss-consumer-${Date.now()}`,
      clean: false, // Persistent sessions
      reconnectPeriod: 1000,
      keepalive: 60,
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('✅ MQTT Consumer connected');
      this.emit('connected');
    });

    this.client.on('message', (topic, payload) => {
      this.handleMessage(topic, payload);
    });

    this.client.on('error', (error) => {
      logger.error('MQTT Consumer error', { error: error.message });
      this.emit('error', error);
    });
  }

  /**
   * Register handler for topic (supports wildcards)
   */
  on(topic: string, handler: EventHandler): void {
    if (!this.handlers.has(topic)) {
      this.handlers.set(topic, new Set());
      // Subscribe when first handler registered
      this.client.subscribe(topic, { qos: 1 }, (error) => {
        if (error) {
          logger.error('Failed to subscribe', { topic, error });
        } else {
          logger.debug('Subscribed to topic', { topic });
        }
      });
    }

    this.handlers.get(topic)!.add(handler);
  }

  /**
   * Unregister handler
   */
  off(topic: string, handler: EventHandler): void {
    const handlers = this.handlers.get(topic);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(topic);
        this.client.unsubscribe(topic);
      }
    }
  }

  /**
   * Process incoming message asynchronously
   */
  private async handleMessage(topic: string, payload: Buffer): Promise<void> {
    const startTime = Date.now();
    this.processingMetrics.total_events++;

    try {
      const message: MQTTEventMessage = JSON.parse(payload.toString());
      message.timestamp = Date.now();

      // Match handlers with wildcard support
      const matchingHandlers = this.getMatchingHandlers(topic);

      if (matchingHandlers.length === 0) {
        logger.debug('No handlers for topic', { topic });
        return;
      }

      // Execute handlers in parallel (non-blocking)
      const results = await Promise.allSettled(
        matchingHandlers.map((handler) => this.executeHandler(handler, message))
      );

      // Process results
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          this.processingMetrics.processed_events++;
        } else {
          logger.error('Handler execution failed', {
            topic,
            error: result.reason,
          });
          this.processingMetrics.failed_events++;
          this.deadLetterQueue.push({
            topic,
            message,
            error: result.reason,
          });
        }
      });

      // Update latency metric
      const latency = Date.now() - startTime;
      this.processingMetrics.avg_latency_ms =
        (this.processingMetrics.avg_latency_ms + latency) / 2;
    } catch (error) {
      logger.error('Message processing error', { topic, error });
      this.processingMetrics.failed_events++;
    }
  }

  /**
   * Execute handler with timeout protection
   */
  private executeHandler(handler: EventHandler, message: MQTTEventMessage): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Handler execution timeout'));
      }, 30000); // 30 second timeout

      try {
        await handler(message);
        clearTimeout(timeout);
        resolve();
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Match topic with wildcard patterns
   */
  private getMatchingHandlers(topic: string): EventHandler[] {
    const handlers: EventHandler[] = [];

    this.handlers.forEach((handlerSet, pattern) => {
      if (this.topicMatches(topic, pattern)) {
        handlerSet.forEach((handler) => handlers.push(handler));
      }
    });

    return handlers;
  }

  /**
   * MQTT wildcard matching
   */
  private topicMatches(topic: string, pattern: string): boolean {
    const topicParts = topic.split('/');
    const patternParts = pattern.split('/');

    for (let i = 0; i < patternParts.length; i++) {
      const patternPart = patternParts[i];

      if (patternPart === '#') {
        return true; // Multi-level wildcard
      }

      if (patternPart === '+') {
        // Single-level wildcard
        if (!topicParts[i]) return false;
      } else {
        if (topicParts[i] !== patternPart) return false;
      }
    }

    return topicParts.length === patternParts.length;
  }

  /**
   * Get dead letter queue (failed events)
   */
  getDeadLetterQueue() {
    return this.deadLetterQueue;
  }

  /**
   * Get processing metrics
   */
  getMetrics() {
    return {
      ...this.processingMetrics,
      dead_letter_queue_size: this.deadLetterQueue.length,
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down MQTT Consumer');
    return new Promise((resolve) => {
      this.client.end(true, {}, () => {
        logger.info('MQTT Consumer closed');
        resolve();
      });
    });
  }
}

export const eventConsumer = new EventConsumer(process.env.MQTT_URL);
