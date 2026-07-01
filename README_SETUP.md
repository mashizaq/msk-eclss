# ECLSS System - Setup & Running Guide

## Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Python 3.10+ (for ROS2 edge nodes)
- Git

## Quick Start (Development)

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

### 3. Start Docker Services (MQTT, InfluxDB, Grafana)

```bash
docker-compose -f docker-compose.habitat.yml up -d
```

Verify services:
- EMQX: http://localhost:18083 (admin/public)
- InfluxDB: http://localhost:8086
- Grafana: http://localhost:3001 (admin/admin)

### 4. Start Backend

```bash
cd src/backend
npm install
npm run dev
```

Backend will be available at `http://localhost:5000`

### 5. Start Frontend

In a new terminal:

```bash
cd src/frontend
npm install
npm run dev
```

Frontend will be available at `http://localhost:3000`

### 6. Start Electron App

In another terminal:

```bash
cd src/electron
npm install
npm run dev
```

## API Endpoints

### Health Check
```bash
curl http://localhost:5000/health
```

### Get System State
```bash
curl http://localhost:5000/api/state
```

### Query Telemetry
```bash
curl 'http://localhost:5000/api/telemetry/eclss_digesters?range=-1h'
```

### Set Setpoint
```bash
curl -X POST http://localhost:5000/api/setpoint \
  -H "Content-Type: application/json" \
  -d '{"system": "digesters", "parameter": "temperature", "value": 37.5}'
```

## Testing

### Publish Test Telemetry

```bash
mqtt_pub -h localhost -p 1883 -t 'eclss/digesters/temperature' -m '{"temperature": 37.2, "timestamp": '$(date +%s)000'}'
```

Or use Node.js:

```javascript
const mqtt = require('mqtt');
const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
  client.publish('eclss/digesters/temperature', JSON.stringify({
    temperature: 37.5,
    timestamp: Date.now()
  }));
});
```

## Production Deployment

### Cloud (Firebase + Node.js)

```bash
cd cloud
npm install
npm run deploy
```

### Docker (Kubernetes)

```bash
docker build -f Dockerfile.prod -t eclss:latest .
kubectl apply -f k8s/deployment.yaml
```

## Monitoring

### View Logs

```bash
# Backend logs
cd src/backend && npm run dev

# Docker logs
docker-compose logs -f
```

### Grafana Dashboards

1. Open http://localhost:3001
2. Add InfluxDB datasource: http://influxdb:8086
3. Import ECLSS dashboard from `monitoring/grafana/dashboards/`

## Architecture Overview

```
┌─────────────────────────────┐
│  Hardware (ROS2 Nodes)      │
│  - Sensors & Actuators      │
└──────────────┬──────────────┘
               │ MQTT
┌──────────────▼──────────────┐
│  EMQX Broker                │
│  (Message Queue)            │
└──────────────┬──────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
┌───▼───┐  ┌──▼──┐  ┌────▼─────┐
│Backend│  │Influx DB │ NGINA AI │
│       │  │        │  │         │
└───┬───┘  └──┬──┘  └────┬─────┘
    │         │          │
    └────┬────┴────┬─────┘
         │         │
    ┌────▼──┐  ┌──▼────┐
    │Desktop│  │Cloud  │
    │App    │  │DB     │
    └───────┘  └───────┘
```

## Troubleshooting

### MQTT Connection Failed
- Check EMQX is running: `docker ps | grep emqx`
- Check port 1883: `netstat -an | grep 1883`

### InfluxDB Query Errors
- Verify bucket exists: Visit http://localhost:8086
- Check token: `echo $INFLUX_TOKEN`

### Electron App Won't Start
- Clear cache: `rm -rf ~/.electron-cache`
- Check React dev server: `http://localhost:3000`

## Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -am 'Add feature'`
3. Push to branch: `git push origin feature/your-feature`
4. Create Pull Request

## License

MIT - See LICENSE file for details
