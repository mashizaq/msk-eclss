# OASEAS ECLSS System - Complete Implementation

**Mars Society Kenya Omni-Africa Space Exploration Analog Simulation (OASEAS) Habitat**

Production-grade Environmental Control and Life Support System with AI-driven crew wellness orchestration.

## 📋 System Overview

The OASEAS ECLSS is a distributed, fault-tolerant platform managing:

- **Zero-Waste Resource Recycling**: Anaerobic digesters + Reverse Osmosis (RO) + Biogas recovery
- **Real-Time Telemetry**: MQTT-based non-blocking event streaming
- **AI Orchestration (NGINA)**: Multi-agent humanoid AI with 4 specialized personas
- **Crew Wellness Monitoring**: SHATC integration (CWIT + BLET task forces)
- **Weather/Climate Tracking**: Autonomous alert system for Martian conditions
- **Desktop App**: Electron + React for CapComm workstation access
- **Cloud Sync**: Mission Control Centre integration via Kafka

## 🏗️ Architecture Tiers

### Tier 1: Hardware Layer (OASEAS Habitat)
- ROS2 edge nodes controlling physical systems
- Sensors: temperature, pressure, pH, flow rate, ORP
- Actuators: pumps, valves, heaters, compressors

### Tier 2: Interconnect Layer (Event Bus)
- **EMQX MQTT Broker** (local mesh, <100ms latency)
- **Apache Kafka** (cloud bridge, durable storage)
- Non-blocking publisher/consumer pattern
- Automatic reconnection & message queuing

### Tier 3: Control & AI Layer
- **Control Engine**: State machine for ECLSS processes
- **NGINA Orchestrator**: Multi-agent AI decision making
- **Crew AI System**: Health + wellness + behavioral monitoring
- **Weather Monitoring**: Climate anomaly detection
- **InfluxDB**: Time-series telemetry storage

### Tier 4: Presentation Layer
- **Desktop App (Electron)**: Real-time dashboards for CapComm
- **WebSocket Bridge**: Live updates to UI
- **Cloud Portal**: Mission Control Centre web interface
- **Reporting**: Analytics & historical trending

## 📂 Repository Structure

```
msk-eclss/
├── ARCHITECTURE.md                    # System design details
├── EVENT_BUS_ARCHITECTURE.md          # Event streaming design
├── README_SETUP.md                    # Setup & deployment guide
├── docker-compose.habitat.yml         # Local services (EMQX, InfluxDB, Kafka)
├── docker-compose.cloud.yml           # Cloud deployment
├── Dockerfile.dev                     # Development container
├── Dockerfile.prod                    # Production container
│
├── src/backend/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts                   # Main entry point
│   │   ├── api/
│   │   │   ├── routes.ts              # REST API routes
│   │   │   ├── crew-routes.ts         # Crew management endpoints
│   │   │   ├── weather-routes.ts      # Weather endpoints
│   │   │   └── ngina-routes.ts        # NGINA AI endpoints
│   │   │
│   │   ├── event-bus/
│   │   │   ├── mqtt-event-publisher.ts    # Non-blocking publisher
│   │   │   └── event-consumer.ts          # Event consumer with wildcards
│   │   │
│   │   ├── ai/
│   │   │   ├── ngina/
│   │   │   │   └── ngina-orchestrator.ts  # AI orchestrator (4 personas)
│   │   │   ├── crew/
│   │   │   │   └── crew-ai-system.ts      # Crew wellness + SHATC
│   │   │   └── weather/
│   │   │       └── weather-monitoring.ts  # Climate monitoring
│   │   │
│   │   ├── services/
│   │   │   ├── control-engine.ts      # ECLSS state machine
│   │   │   └── safety-interlock.ts    # Safety logic
│   │   │
│   │   ├── db/
│   │   │   └── influx-client.ts       # InfluxDB connection
│   │   │
│   │   └── utils/
│   │       ├── logger.ts
│   │       └── validators.ts
│   │
│   └── mqtt/
│       ├── emqx-config.yaml           # MQTT broker config
│       └── topics.js                  # Topic definitions
│
├── src/frontend/
│   ├── package.json
│   ├── src/
│   │   ├── components/                # React components
│   │   ├── redux/                     # Redux Toolkit slices
│   │   ├── pages/                     # App routes
│   │   └── services/                  # API clients
│   └── public/
│
├── src/electron/
│   ├── main.ts                        # Electron main process
│   ├── preload.ts                     # IPC bridge
│   └── package.json
│
├── cloud/
│   ├── package.json
│   ├── src/
│   │   └── index.ts                   # API Gateway
│   ├── db/
│   │   └── schema.prisma              # Database schema (TimescaleDB)
│   └── functions/
│       └── handlers.ts                # Cloud functions
│
├── monitoring/
│   ├── prometheus.yml                 # Prometheus config
│   ├── grafana/
│   │   └── dashboards/
│   │       ├── eclss-overview.json
│   │       ├── crew-wellness.json
│   │       └── weather-alerts.json
│   └── alerting/
│       └── rules.yml                  # Alert rules
│
├── kubernetes/
│   ├── deployment.yaml                # K8s deployment
│   ├── service.yaml
│   └── configmap.yaml                 # Config & secrets
│
├── docs/
│   ├── API.md                         # API documentation
│   ├── DEPLOYMENT.md                  # Deployment guide
│   ├── TROUBLESHOOTING.md             # Common issues
│   └── CREW_PROTOCOL.md               # Crew procedures
│
└── tests/
    ├── unit/                          # Unit tests
    ├── integration/                   # Integration tests
    └── e2e/                           # End-to-end tests
```

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Python 3.10+ (for ROS2 integration)

### 1. Clone & Install
```bash
git clone https://github.com/mashizaq/msk-eclss.git
cd msk-eclss
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env.development
# Edit .env.development with your settings
```

### 3. Start Local Services
```bash
docker-compose -f docker-compose.habitat.yml up -d
```

**Service URLs:**
- EMQX Admin: http://localhost:18083 (admin/public)
- InfluxDB: http://localhost:8086
- Grafana: http://localhost:3001 (admin/admin)
- Prometheus: http://localhost:9090

### 4. Start Backend
```bash
cd src/backend
npm install
npm run dev
# Backend available at http://localhost:5000
```

### 5. Start Frontend (new terminal)
```bash
cd src/frontend
npm install
npm run dev
# Frontend available at http://localhost:3000
```

### 6. Launch Desktop App (new terminal)
```bash
cd src/electron
npm install
npm run dev
# Electron window opens automatically
```

## 📡 API Quick Reference

### System Health
```bash
curl http://localhost:5000/health
```

### ECLSS Telemetry
```bash
# Get digesters data (last hour)
curl 'http://localhost:5000/api/telemetry/eclss_digesters?range=-1h'

# Get RO membrane data
curl 'http://localhost:5000/api/telemetry/eclss_ro?range=-24h'
```

### Crew Management
```bash
# Add crew member
curl -X POST http://localhost:5000/api/crew \
  -H "Content-Type: application/json" \
  -d '{
    "crew_id": "crew_001",
    "name": "Dr. Sarah Chen",
    "role": "Mission Commander"
  }'

# Get crew wellness summary
curl http://localhost:5000/api/crew-wellness/summary

# Get crew logs
curl 'http://localhost:5000/api/crew-logs?crew_id=crew_001'
```

### Weather Monitoring
```bash
# Get current weather
curl http://localhost:5000/api/weather/current

# Get weather trends
curl http://localhost:5000/api/weather/trends

# Get active alerts
curl http://localhost:5000/api/weather/alerts
```

### NGINA AI
```bash
# Get NGINA status
curl http://localhost:5000/api/ngina/status

# Get personality info
curl http://localhost:5000/api/ngina/personality/sophia
```

## 📊 Key Features

### ✅ Non-Blocking Event Bus
- MQTT publisher returns immediately (no waiting for ack)
- Consumers process events asynchronously in worker pools
- Automatic message queuing during network drops
- Dead letter queues for failed events
- Exponential backoff reconnection

### ✅ NGINA Humanoid AI
- **4 AI Personas**: Sophia, Alexa, Jexi, Stars on Mars
- **Decision Engine**: Real-time anomaly detection & recommendations
- **Computer Vision Ready**: Framework for crew health & habitat monitoring
- **Deep Learning**: LSTM models for telemetry analysis
- **Autonomous Updates**: Self-patching with test-driven reflection

### ✅ Crew AI System
- **Add/Remove Crew**: Individual crew management
- **Health Monitoring**: Vitals tracking (heart rate, O₂, temp, stress)
- **Wellness Scoring**: Physical + Psychological + Behavioral (0-100)
- **SHATC Integration**: CWIT (wellness) + BLET (behavioral) task forces
- **Individual Logs**: Activity, health, wellness, incident reports

### ✅ Weather/Climate Monitoring
- **Parameters**: Pressure, temperature, humidity, wind, solar radiation, visibility
- **Anomaly Detection**: Extreme weather alerts with recommended actions
- **Trend Analysis**: 1h & 6h forecasts
- **Integration**: Automatic control adjustments based on weather

### ✅ Desktop Application
- **Electron + React**: Cross-platform (Linux/macOS/Windows)
- **Real-time Dashboards**: Recharts visualization
- **Manual Controls**: Override mechanisms for CapComm
- **Offline-First**: SQLite caching for network loss scenarios
- **WebSocket Bridge**: Live updates without polling

### ✅ Cloud Integration
- **Mission Control Centre**: Web portal for remote monitoring
- **Kafka Bridge**: Durable, scalable event streaming
- **Firebase/AWS IoT**: Real-time data synchronization
- **Historical Analytics**: TimescaleDB for trending

## 🔧 Configuration

### Environment Variables

```bash
# Backend
NODE_ENV=production
PORT=5000
LOG_LEVEL=info

# MQTT
MQTT_URL=mqtt://emqx:1883
MQTT_USERNAME=eclss
MQTT_PASSWORD=secure-password

# InfluxDB
INFLUX_URL=http://influxdb:8086
INFLUX_TOKEN=your-token
INFLUX_ORG=mars-society-kenya
INFLUX_BUCKET=eclss-telemetry

# Kafka
KAFKA_BROKERS=kafka:9092
KAFKA_TOPIC_PREFIX=eclss

# Firebase / AWS
FIREBASE_PROJECT_ID=your-project
FIREBASE_PRIVATE_KEY=xxx
AWS_REGION=us-east-1

# Authentication
JWT_SECRET=your-secret
JWT_EXPIRY=7d
```

## 📈 Monitoring & Observability

### Grafana Dashboards
- **ECLSS Overview**: System status, digesters, RO membrane, biogas
- **Crew Wellness**: Individual health scores, trend analysis
- **Weather Alerts**: Current conditions, forecast, warnings
- **AI Decision Log**: NGINA alerts, recommendations, confidence scores

### Prometheus Metrics
```
eclss_telemetry_latency_ms        # Data ingestion latency
eclss_control_commands_total      # Control commands executed
ngina_decisions_total             # AI decisions made
ngina_decision_confidence         # Average confidence score
crew_wellness_score               # Crew wellness metrics
weather_alert_count               # Active weather alerts
mqtt_publish_errors_total         # MQTT publish failures
kafka_consumer_lag                # Event lag
```

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### Integration Tests
```bash
npm run test:integration
```

### End-to-End Tests
```bash
npm run test:e2e
```

### Publish Test Telemetry
```bash
# Using MQTT CLI
mqtt_pub -h localhost -t 'eclss/digesters/temperature' \
  -m '{"value": 37.5, "unit": "celsius"}'

# Using Node.js
node scripts/publish-test-data.js
```

## 🚢 Production Deployment

### Option 1: Docker (Local Habitat)
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Option 2: Kubernetes (Cloud)
```bash
kubectl apply -f kubernetes/
```

### Option 3: Managed Services
- **Firebase Hosting** for web portal
- **AWS ECS** for containers
- **Azure IoT Hub** for device management
- **Google Cloud Run** for serverless functions

## 📝 Documentation

- **[API Documentation](docs/API.md)** - Complete endpoint reference
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production setup
- **[Troubleshooting](docs/TROUBLESHOOTING.md)** - Common issues
- **[Crew Protocol](docs/CREW_PROTOCOL.md)** - Operational procedures
- **[Architecture](ARCHITECTURE.md)** - System design details
- **[Event Bus Design](EVENT_BUS_ARCHITECTURE.md)** - Event streaming architecture

## 🔐 Security

- **Authentication**: JWT tokens for all APIs
- **Encryption**: TLS 1.3 for cloud communication
- **RBAC**: Role-based access control (CapComm, Crew, Admin)
- **Audit Logging**: All actions logged with timestamps
- **Network Isolation**: EMQX broker isolated to habitat network

## 🎯 Roadmap

**Phase 1 (Current):** Core system deployed
- ✅ ECLSS control engine
- ✅ Event bus (MQTT + Kafka)
- ✅ NGINA AI orchestrator
- ✅ Crew wellness system
- ✅ Weather monitoring

**Phase 2:** Advanced AI
- Computer vision integration
- Autonomous decision-making
- Predictive maintenance
- Resource optimization

**Phase 3:** Enterprise Scale
- Multi-habitat federation
- Mission Control Centre web portal
- Mobile app for crew alerts
- Real-time collaboration tools

**Phase 4:** Autonomous Operations
- Full autonomous habitat control
- Self-healing systems
- Zero-intervention mode
- Extended mission duration (1+ years)

## 📞 Support

- **Issues**: https://github.com/mashizaq/msk-eclss/issues
- **Discussions**: https://github.com/mashizaq/msk-eclss/discussions
- **Email**: contact@marssocietykenya.org

## 📜 License

MIT - See LICENSE file

## 👥 Contributors

Mars Society Kenya - OASEAS Habitat Project Team

---

**Built with ❤️ for extreme analog environments** 🚀
