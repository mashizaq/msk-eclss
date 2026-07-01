# ECLSS System Architecture

## Overview

The Environmental Control and Life Support System (ECLSS) is a production-grade, AI-driven platform managing closed-loop waste and wastewater for the OASEAS habitat. It ensures zero-waste output through intelligent resource recycling and real-time anomaly detection.

**Key Objectives:**
- ✅ Zero-waste output with total resource recovery
- ✅ Real-time telemetry and predictive maintenance
- ✅ AI-driven anomaly detection and response
- ✅ Desktop-accessible CapComm interface
- ✅ Cloud sync to Mission Control Centre (MCC)
- ✅ Deterministic hardware control via ROS2 edges

## System Stack

### Frontend (Desktop Application)
- **Framework**: Electron + React 18 with TypeScript
- **UI Library**: Shadcn/ui with Tailwind CSS
- **State Management**: Redux Toolkit + RTK Query
- **Charting**: Recharts for real-time telemetry visualization
- **Target**: Linux/macOS/Windows (CapComm workstation)

### Backend (Local Control)
- **Language**: Node.js + Python microservices
- **Messaging**: MQTT (EMQX broker) for edge-to-cloud
- **Time-Series DB**: InfluxDB v3 (edge instance)
- **Process Manager**: PM2
- **APIs**: Express.js REST + WebSocket

### Edge Layer (Habitat Hardware)
- **Embedded Control**: ROS2 Humble with custom nodes
- **Hardware Interface**: Modbus/serial to pumps, valves, sensors
- **Edge MQTT Pub**: Real-time telemetry to EMQX

### Cloud Layer (Mission Control Sync)
- **Cloud DB**: Firebase Realtime DB or AWS IoT Core
- **Data Lake**: TimescaleDB (PostgreSQL) for historical analytics
- **API Gateway**: Node.js Express with authentication
- **Hosting**: Docker containers on K8s or managed services

### AI/ML (Anomaly Detection - NGINA)
- **Framework**: TensorFlow.js / Python FastAPI
- **Models**: Time-series LSTM for anomaly detection
- **Training**: Offline on historical telemetry
- **Inference**: Real-time on edge or cloud

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    HARDWARE (Habitat)                           │
├─────────────────────────────────────────────────────────────────┤
│  [Sensors] ──→ [ROS2 Edge Nodes] ──→ [MQTT Pub]               │
│  - Flow meters     - Pump control      - Topics:               │
│  - Pressure gauges - Valve actuators   eclss/digesters/temp   │
│  - pH/ORP probes   - Safety interlocks eclss/ro/pressure      │
│  - Temperature     - Telemetry read    eclss/biogas/volume    │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (MQTT)
┌─────────────────────────────────────────────────────────────────┐
│                  EDGE/LOCAL CONTROL LAYER                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  EMQX Broker   │←──→│  InfluxDB    │←──→│  NGINA AI    │   │
│  │  (MQTT)        │    │  (Telemetry) │    │  (Monitoring)│   │
│  └────────────────┘    └──────────────┘    └──────────────┘   │
│         ↕                      ↕                    ↕           │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Control Logic Services (Node.js/Python)              │    │
│  │  - Process state machines                             │    │
│  │  - Setpoint regulation (temp, pressure, pH)           │    │
│  │  - Safety interlocks                                  │    │
│  │  - Resource optimization (water, biogas)              │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (HTTP/WebSocket)
┌─────────────────────────────────────────────────────────────────┐
│            DESKTOP APPLICATION (CapComm Workstation)            │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐    │
│  │     Electron Main Process (Main Thread)                │    │
│  │  - IPC bridge to renderer                              │    │
│  │  - Local DB (SQLite for offline caching)              │    │
│  │  - Cloud sync orchestration                            │    │
│  └────────────────────────────────────────────────────────┘    │
│         ↕                                          ↕            │
│  ┌────────────────────┐    ┌──────────────────┐   │            │
│  │  React Dashboard   │    │  Notification    │   │            │
│  │  - Real-time       │    │  System & Alerts │   │            │
│  │    telemetry viz   │    │  - Anomalies     │   │            │
│  │  - Manual control  │    │  - Maintenance   │   │            │
│  │  - Historical data │    │  - Safety issues │   │            │
│  │  - Settings panel  │    └──────────────────┘   │            │
│  └────────────────────┘                          │            │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (HTTPS/WSS)
┌─────────────────────────────────────────────────────────────────┐
│        CLOUD LAYER (Mission Control Centre & Support)           │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │  Auth Service  │    │  API Gateway │    │  Data Lake   │   │
│  │  (JWT/OAuth2)  │    │  (Express)   │    │(TimescaleDB) │   │
│  └────────────────┘    └──────────────┘    └──────────────┘   │
│         ↕                      ↕                    ↕           │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Cloud Storage (Firebase Realtime DB or AWS IoT)      │    │
│  │  - Live habitat telemetry                             │    │
│  │  - Sync queue for offline-first app                   │    │
│  │  - User authentication & permissions                  │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow: Request → Response

### 1. **Sensor Reading → Edge Control**
```
[Physical Sensor] 
  ↓ (Analog/Serial)
[ROS2 Node Driver]
  ↓ (Message)
[ROS2 Publisher]
  ↓ (MQTT Pub)
[EMQX Topic: eclss/ro/pressure]
```

### 2. **Edge Processing → Telemetry DB**
```
[MQTT Subscriber in Control Service]
  ↓ (JSON payload)
[Process State Machine]
  ↓ (Decision: adjust setpoint?)
[InfluxDB Write]
  ↓ (Time-series point)
[InfluxDB Query] → [Alerts/Actions]
```

### 3. **Desktop App → Local Backend**
```
[React Component]
  ↓ (RTK Query)
[HTTP GET /api/telemetry?since=now-1h]
  ↓ (Express endpoint)
[InfluxDB Query]
  ↓ (Time-series data)
[JSON Response]
  ↓ (Redux store)
[Recharts Visualization]
```

### 4. **Cloud Sync (Offline-First)**
```
[CapComm Manual Override]
  ↓ (Redux action)
[Sync Queue (SQLite)]
  ↓ (When online)
[POST /api/cloud/sync]
  ↓ (Firebase/AWS)
[Cloud DB updated]
  ↓ (Real-time listener)
[Mission Control sees change]
```

## Core Modules

### `src/backend/services/`
- **control-engine.js**: Main state machine for process sequences
- **safety-interlock.js**: Hardware safety logic
- **telemetry-ingest.js**: MQTT subscriber + InfluxDB writer
- **resource-optimizer.js**: AI suggestions for waste reduction
- **cloud-sync.js**: Offline-first cloud synchronization

### `src/backend/mqtt/`
- **emqx-config.yaml**: MQTT broker configuration
- **topics.js**: Topic definitions and parsers
- **subscribers.js**: Edge telemetry listeners

### `src/frontend/`
- **components/**: React components (Dashboard, Telemetry, Controls)
- **redux/**: State management (slices, middleware)
- **services/**: API clients, IPC bridges
- **pages/**: Main app routes

### `src/embedded/`
- **ros2-nodes/**: ROS2 C++ nodes for hardware control
- **drivers/**: Modbus, Serial interfaces

### `cloud/`
- **api/**: Express.js API gateway
- **db/**: Prisma migrations (TimescaleDB)
- **functions/**: Cloud functions for alerts/reporting

## Deployment

### Local (Habitat)
1. Docker Compose: `docker-compose -f docker-compose.habitat.yml up`
2. Includes: ROS2, EMQX, InfluxDB, Node.js backend, Electron app

### Cloud (Mission Control)
1. Kubernetes or managed service (Vercel, Railway)
2. Environment: `.env.production` with Firebase/AWS credentials
3. Database: TimescaleDB (PostgreSQL with time-series extension)

## Zero-Waste Logic

**Anaerobic Digesters:**
- Input: Solid biomass + organic waste
- Output: Biogas (energy) + Nutrient-rich compost (hydroponic substrate)
- AI monitors: Temperature (37°C ±2), pH (6.8-7.2), C:N ratio
- Alerts on: Odor spike (H₂S), pressure anomalies, pH drift

**Reverse Osmosis Modules:**
- Input: Graywater + blackwater
- Output: Purified H₂O (>99%) + Nutrient brine (recycled to digesters)
- AI monitors: Feed pressure, membrane integrity, TDS levels
- Alerts on: Pressure spike (blockage), membrane fouling, low recovery rate

**Biogas Recovery:**
- Capture rate: 2-3 m³/kg volatile solids/day
- Use: Habitat heating + backup fuel cell
- Storage: Gas bag with pressure relief

## Security & Reliability

- **Authentication**: JWT tokens for cloud APIs, local auth for desktop
- **Data Encryption**: TLS 1.3 for cloud communication, optional local encryption
- **Redundancy**: Dual MQTT brokers, InfluxDB replication
- **Logging**: Structured logging (Winston/Pino) with ELK stack ready
- **Monitoring**: Prometheus metrics + Grafana dashboards

## Development Roadmap

**Phase 1 (Current):** Foundation
- Basic telemetry ingestion
- Desktop app skeleton
- Manual control interface

**Phase 2:** AI Integration
- NGINA anomaly detection models
- Predictive maintenance
- Resource optimization

**Phase 3:** Cloud & Mobile
- Mission Control Centre web portal
- Cloud sync & real-time collaboration
- Mobile app for alerts

**Phase 4:** Advanced Features
- Digital twin integration
- Autonomous decision-making
- Multi-habitat federation
