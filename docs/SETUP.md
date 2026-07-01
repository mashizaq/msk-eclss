# OASEAS ECLSS - Installation & Setup Guide

## System Requirements

### Hardware (Habitat)
- **Edge Compute**: NVIDIA Jetson Orin or equivalent (for ROS2 + AI inference)
- **Storage**: 500GB SSD (telemetry database)
- **RAM**: 16GB minimum
- **Network**: Gigabit ethernet + WiFi 6 mesh

### Software
- **OS**: Ubuntu 22.04 LTS
- **Node.js**: v20.x LTS
- **Python**: 3.10+
- **Docker**: 24.x+
- **ROS2**: Humble distribution

## Installation Steps

### 1. Clone Repository

```bash
git clone https://github.com/mashizaq/msk-eclss.git
cd msk-eclss
```

### 2. Install Dependencies

```bash
# Install Node.js & npm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Install root dependencies
npm install

# Install workspace dependencies
cd src/backend && npm install
cd ../frontend && npm install
cd ../electron && npm install
cd ../../cloud && npm install
cd ../..
```

### 3. Install Docker

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER

# Verify
docker --version
docker-compose --version
```

### 4. Install ROS2 (Optional - for actual hardware)

```bash
# Add ROS2 repository
sudo apt-get update
sudo apt-get install -y curl gnupg2 lsb-release ubuntu-keyring

# Add ROS2 GPG key
sudo curl -sSL https://repo.ros2.org/ros.key -o /usr/share/keyrings/ros-archive-keyring.gpg

# Add ROS2 repository
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] http://packages.ros.org/ros2/ubuntu $(source /etc/os-release && echo $UBUNTU_CODENAME) main" | sudo tee /etc/apt/sources.list.d/ros2.list > /dev/null

# Install ROS2 Humble
sudo apt-get update
sudo apt-get install -y ros-humble-desktop

# Source ROS2 environment
echo "source /opt/ros/humble/setup.bash" >> ~/.bashrc
source ~/.bashrc
```

### 5. Configure Environment

```bash
# Copy example environment file
cp .env.example .env.development
cp .env.example .env.production

# Edit development environment
vim .env.development
```

**Development .env.development:**
```bash
NODE_ENV=development
PORT=5000
LOG_LEVEL=debug

MQTT_URL=mqtt://localhost:1883
MQTT_USERNAME=eclss
MQTT_PASSWORD=eclss-password

INFLUX_URL=http://localhost:8086
INFLUX_TOKEN=dev-token
INFLUX_ORG=mars-society-kenya
INFLUX_BUCKET=eclss-telemetry

REACT_APP_API_URL=http://localhost:5000
REACT_APP_WS_URL=ws://localhost:5000
```

### 6. Start Local Services

```bash
# Start Docker services (EMQX, InfluxDB, Grafana, Prometheus)
docker-compose -f docker-compose.habitat.yml up -d

# Verify services are running
docker-compose ps

# Check logs
docker-compose logs -f
```

**Access Points:**
- EMQX Admin: http://localhost:18083 (admin/public)
- InfluxDB: http://localhost:8086
- Grafana: http://localhost:3001 (admin/admin)
- Prometheus: http://localhost:9090

### 7. Initialize Databases

```bash
# Create InfluxDB bucket
INFLUX_ORG=mars-society-kenya INFLUX_BUCKET=eclss-telemetry INFLUX_TOKEN=dev-token \
  docker exec eclss-influxdb \
  influx bucket create \
    --name eclss-telemetry \
    --org mars-society-kenya \
    --retention 30d

# Verify bucket
docker exec eclss-influxdb influx bucket list
```

### 8. Start Backend Server

```bash
# Terminal 1: Backend
cd src/backend
npm run dev

# Output should show:
# 🚀 Starting ECLSS Backend
# ✅ InfluxDB connected
# ✅ MQTT broker connected
# ✅ API routes initialized
# 🌐 Server listening on port 5000
```

### 9. Start Frontend Development Server

```bash
# Terminal 2: Frontend
cd src/frontend
npm run dev

# Output should show:
# ✅ Server is ready
# ➜  Local:   http://localhost:3000
```

### 10. Start Electron Desktop App

```bash
# Terminal 3: Electron
cd src/electron
npm run dev

# Electron window opens automatically
# Connects to http://localhost:3000
```

## Verification

### 1. Test API Health

```bash
curl http://localhost:5000/health
# Expected: {"status":"ok","timestamp":"..."}  
```

### 2. Test MQTT Connection

```bash
# Publish test message
mqtt_pub -h localhost -t 'eclss/digesters/temperature' \
  -m '{"value": 37.5, "unit": "celsius", "timestamp": '$(date +%s)000'}'

# Check backend logs for message received
```

### 3. Test Telemetry Query

```bash
curl 'http://localhost:5000/api/telemetry/eclss_digesters?range=-1h'
# Expected: Array of telemetry points
```

### 4. Test Crew Management

```bash
# Add crew member
curl -X POST http://localhost:5000/api/crew \
  -H "Content-Type: application/json" \
  -d '{
    "crew_id": "crew_001",
    "name": "Dr. Test",
    "role": "Scientist"
  }'

# Get crew
curl http://localhost:5000/api/crew
```

### 5. Test Desktop App

- Open Electron window
- Navigate to "Dashboard" tab
- Should see "Connected" status
- Check for telemetry data on charts

## Useful Commands

### Docker Management

```bash
# View logs
docker-compose logs -f emqx
docker-compose logs -f influxdb
docker-compose logs -f backend

# Restart service
docker-compose restart emqx

# Stop all services
docker-compose down

# Stop and remove volumes (reset data)
docker-compose down -v
```

### MQTT CLI

```bash
# Subscribe to topic
mqtt_sub -h localhost -t 'eclss/#' -v

# Publish message
mqtt_pub -h localhost -t 'eclss/digesters/temperature' \
  -m '{"value": 37.5}'

# List all topics
mqtt_list_topics
```

### InfluxDB CLI

```bash
# Connect to InfluxDB
influx config create -n default -u http://localhost:8086 -t dev-token -o mars-society-kenya

# Query data
influx query 'from(bucket:"eclss-telemetry") |> range(start:-1h)'

# List buckets
influx bucket list
```

### Git Workflow

```bash
# Switch to feature branch
git checkout feature/event-bus-ngina-ai

# Create new feature branch
git checkout -b feature/your-feature

# Make changes, commit
git add .
git commit -m "feat: your feature description"

# Push to GitHub
git push origin feature/your-feature

# Create pull request on GitHub
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :5000

# Kill process
kill -9 <PID>

# Or use different port
PORT=5001 npm run dev
```

### MQTT Connection Failed

```bash
# Check EMQX is running
docker-compose ps emqx

# Check port 1883 is open
netstat -an | grep 1883

# Restart EMQX
docker-compose restart emqx
```

### InfluxDB Token Invalid

```bash
# Check token
docker exec eclss-influxdb influx auth list

# Create new token
docker exec eclss-influxdb influx auth create \
  --org mars-society-kenya \
  --description "Dev token"

# Update .env with new token
```

### Frontend Won't Connect

```bash
# Check backend is running
curl http://localhost:5000/health

# Check CORS settings
# Backend logs should show connection attempts

# Clear browser cache and reload
```

### Memory Issues

```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" npm run dev

# Increase Docker memory
docker-compose down
# Edit docker-compose.yml, set memory limits
docker-compose up -d
```

## Next Steps

1. **Read Architecture Docs**: See [ARCHITECTURE.md](../ARCHITECTURE.md)
2. **Explore API**: See [API.md](API.md)
3. **Deploy to Cloud**: See [DEPLOYMENT.md](DEPLOYMENT.md)
4. **Join Development**: See [CONTRIBUTING.md](CONTRIBUTING.md)

---

**Happy hacking!** 🚀
