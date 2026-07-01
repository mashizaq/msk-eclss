# Interconnect Layer: Asynchronous Event Bus Architecture

## Overview

The Interconnect Layer provides a **fault-tolerant, non-blocking event streaming backbone** for OASEAS. Instead of synchronous REST APIs (which cause thread blocking during network degradation), the platform uses **EMQX MQTT Broker** and **Apache Kafka** to broadcast telemetry and state changes asynchronously.

**Key Principle:** If an edge node drops offline, AI worker threads and UIs continue operating without backpressure or blocking.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          EVENT SOURCES (Publishers)                          │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [ECLSS Edge Nodes]    [Control Engine]    [NGINA AI]    [Crew Dashboard]   │
│  (ROS2 Telemetry)      (Setpoint Changes)  (Alerts)      (Manual Events)    │
│        │                       │              │                 │           │
└────────┼───────────────────────┼──────────────┼─────────────────┼───────────┘
         │                       │              │                 │
         │  MQTT Publish         │              │                 │
         └───────────────────────┴──────────────┴─────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   EMQX MQTT Broker     │
                    │  (Local Habitat Mesh)  │
                    │  Topics:               │
                    │  - eclss/*             │
                    │  - crew/*              │
                    │  - weather/*           │
                    │  - ngina/*             │
                    │  - alerts/*            │
                    └────────────┬────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         │                       │                       │
         │  Bridge Connection    │ Local Subscribers     │
         │  (to Cloud)           │ (UI, AI, Control)     │
         │                       │                       │
    ┌────▼────┐          ┌──────▼──────┐      ┌────▼──────────┐
    │  Kafka  │          │  InfluxDB   │      │  NGINA Event  │
    │ Topics  │          │  (Write)    │      │  Processor    │
    │ (Cloud) │          │             │      │               │
    └─────────┘          └─────────────┘      └────┬──────────┘
                                                   │
                                    ┌──────────────┼──────────────┐
                                    │              │              │
                              ┌─────▼───┐  ┌─────▼───┐  ┌────▼──────┐
                              │ Anomaly │  │Crew     │  │ Climate   │
                              │Detection│  │ Agents  │  │ Monitoring│
                              └─────────┘  └─────────┘  └───────────┘
                                    │              │              │
                                    └──────────────┼──────────────┘
                                                   │
                                    ┌──────────────▼──────────────┐
                                    │   Event Response Topics     │
                                    │  - control/commands/*       │
                                    │  - alerts/critical/*        │
                                    │  - ui/updates/*             │
                                    └─────────────────────────────┘
```

## Topic Hierarchy

### ECLSS Telemetry Topics
```
eclss/digesters/temperature
eclss/digesters/pressure
eclss/digesters/ph
eclss/digesters/biogas_volume
eclss/ro/feed_pressure
eclss/ro/permeate_tds
eclss/ro/membrane_status
eclss/biogas/volume
eclss/biogas/pressure
eclss/pump/flow_rate
eclss/system/status
```

### Crew Monitoring Topics
```
crew/health/vitals/{crew_id}
  - heart_rate
  - oxygen_saturation
  - body_temperature
  - stress_level
  
crew/location/{crew_id}
crew/activity/{crew_id}
crew/log/entry/{crew_id}
crew/wellness/summary
```

### Weather/Climate Topics
```
weather/atmospheric/pressure
weather/atmospheric/temperature
weather/atmospheric/humidity
weather/wind/speed
weather/wind/direction
weather/solar/radiation
weather/visibility
```

### NGINA AI Topics
```
ngina/alerts/anomaly
ngina/alerts/critical
ngina/decision/recommendation
ngina/decision/override_suggestion
ngina/status/processing
ngina/crew_wellness/assessment
ngina/crew_wellness/intervention
```

### Control Command Topics
```
control/commands/digesters/{command}
control/commands/ro/{command}
control/commands/biogas/{command}
control/setpoint/{system}/{parameter}
control/manual_override/{component}
```

## Message Format

### Standard Telemetry Packet
```json
{
  "timestamp": 1693478400000,
  "source": "eclss_edge_node_01",
  "topic": "eclss/digesters/temperature",
  "data": {
    "value": 37.2,
    "unit": "celsius",
    "status": "nominal",
    "confidence": 0.99
  },
  "metadata": {
    "sensor_id": "temp_sensor_001",
    "location": "main_digester",
    "hardware_version": "v2.1"
  }
}
```

### Alert/Event Packet
```json
{
  "timestamp": 1693478450000,
  "source": "ngina_ai",
  "event_type": "anomaly_detected",
  "severity": "high",
  "topic": "ngina/alerts/anomaly",
  "payload": {
    "anomaly_id": "anomaly_20240901_001",
    "system": "ro_membrane",
    "description": "Permeate TDS spike detected",
    "confidence": 0.94,
    "recommended_action": "Activate RO backflush",
    "time_to_critical": 300
  },
  "context": {
    "recent_telemetry": { ... },
    "historical_baseline": { ... }
  }
}
```

## Resilience & Backpressure Handling

### Connection Loss Scenarios

**1. Edge Node Offline (Network Dip)**
- MQTT broker retains last known state (retain flag)
- AI workers continue processing cached data
- UI shows last known values with "stale" indicator
- Automatic reconnection attempts (exponential backoff)
- Persistent queues buffer messages locally

**2. Subscriber Overload (Backpressure)**
- Kafka partitioning for distributed consumption
- Consumer groups allow parallel processing
- Dead letter queues for failed messages
- Circuit breaker pattern on slow consumers

**3. Multi-Path Delivery**
- MQTT for real-time local telemetry (<100ms latency)
- Kafka for cloud sync & durability (guaranteed delivery)
- Both streams run in parallel

### Configuration

```yaml
# EMQX Configuration
emqx:
  listeners:
    tcp:
      default:
        bind: 0.0.0.0:1883
        max_connections: 1000000
        mountpoint: "/"
  
  retention:
    # Retain messages for offline subscribers
    max_retained_messages: 10000
    max_retained_message_size: 64KB
  
  session:
    # Persistent sessions during network drops
    max_inflight: 100
    awaiting_rel_timeout: 300s

# Kafka Configuration
kafka:
  brokers:
    - kafka:9092
  
  topics:
    eclss_telemetry:
      partitions: 10
      replication_factor: 3
      retention_ms: 604800000  # 7 days
    
    ngina_events:
      partitions: 5
      replication_factor: 2
      retention_ms: 259200000  # 3 days
  
  consumer:
    group_id: eclss_ai_workers
    auto_offset_reset: latest
    enable_auto_commit: true
```

## Implementation Patterns

### Non-Blocking Event Handler

```typescript
// Do NOT wait for responses
publisher.publish(topic, message, { qos: 1 }, (err) => {
  if (err) logger.error('Publish failed', { topic, err });
  // Continue without waiting
});

// Process events asynchronously
subscriber.on('message', async (topic, payload) => {
  // Offload to worker pool
  workerPool.submit(async () => {
    try {
      await processEvent(topic, payload);
    } catch (error) {
      deadLetterQueue.push({ topic, payload, error });
    }
  });
});
```

### Graceful Degradation

```typescript
// Cache last known state
const stateCache = new Map();

subscriber.on('message', (topic, payload) => {
  stateCache.set(topic, {
    data: JSON.parse(payload),
    timestamp: Date.now(),
    stale: false
  });
});

// UI can query cache even if broker is offline
api.get('/api/state', (req, res) => {
  const state = Array.from(stateCache.values());
  const allStale = state.every(s => Date.now() - s.timestamp > 30000);
  
  res.json({
    data: state,
    status: allStale ? 'degraded' : 'normal'
  });
});
```

## Monitoring & Observability

### Metrics to Track

```typescript
const metrics = {
  // MQTT
  mqtt_connections: gauge,
  mqtt_published_messages: counter,
  mqtt_subscription_lag: histogram,
  mqtt_connection_errors: counter,
  
  // Kafka
  kafka_consumer_lag: gauge,
  kafka_produced_messages: counter,
  kafka_consumer_errors: counter,
  
  // Event Processing
  event_processing_latency: histogram,
  event_processing_errors: counter,
  deadletter_queue_size: gauge,
  
  // System Health
  ai_worker_thread_pool_utilization: gauge,
  ui_websocket_connections: gauge,
  cache_hit_rate: gauge
};
```

### Health Check Endpoints

```bash
# MQTT Health
GET /health/mqtt
{
  "status": "healthy",
  "connected_clients": 1247,
  "uptime_seconds": 86400,
  "topics_active": 42
}

# Kafka Health
GET /health/kafka
{
  "status": "healthy",
  "consumer_lag": 0,
  "brokers_alive": 3,
  "partitions_healthy": 15
}

# Event Bus Overall
GET /health/eventbus
{
  "status": "healthy",
  "mqtt": "healthy",
  "kafka": "healthy",
  "cache_stale_percentage": 0.1,
  "error_rate_1m": 0.002
}
```

## Deployment

### Docker Compose

```yaml
version: '3.8'
services:
  emqx:
    image: emqx/emqx:5.2.0
    ports:
      - "1883:1883"
    environment:
      EMQX_NAME: emqx_oaseas
      EMQX_LISTENERS__TCP__DEFAULT__BACKLOG: 16777216

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    depends_on:
      - zookeeper
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:9092
      KAFKA_NUM_PARTITIONS: 10
      KAFKA_DEFAULT_REPLICATION_FACTOR: 1

  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
```

## Benefits

✅ **Non-blocking:** Network issues don't cascade to UI or AI workers  
✅ **Scalable:** Kafka partitioning enables horizontal scaling  
✅ **Durable:** Retention policies ensure no message loss  
✅ **Observable:** Built-in metrics & monitoring  
✅ **Resilient:** Automatic failover and reconnection  
✅ **Real-time:** <100ms latency for critical alerts  
