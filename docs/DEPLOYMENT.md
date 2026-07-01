# OASEAS ECLSS Deployment Guide

## Production Checklist

### Pre-Deployment
- [ ] All environment variables configured
- [ ] SSL/TLS certificates generated
- [ ] Database backups enabled
- [ ] Monitoring & alerting setup
- [ ] Incident response procedures documented
- [ ] Crew training completed
- [ ] Mission Control Centre ready

### Deployment Steps

## Option 1: Docker Compose (Local Habitat)

### 1. Configure Environment
```bash
cp .env.example .env.production
# Edit with production values
```

### 2. Build Images
```bash
docker-compose -f docker-compose.prod.yml build
```

### 3. Start Services
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Verify Services
```bash
docker-compose logs -f backend
# Wait for: "🌐 Server listening on port 5000"

docker-compose ps
# All services should show "Up"
```

### 5. Test API
```bash
curl http://localhost:5000/health
# Should return: {"status":"ok",...}
```

## Option 2: Kubernetes (Cloud)

### 1. Create Cluster
```bash
kubectl create namespace eclss
kubectl config set-context --current --namespace=eclss
```

### 2. Create Secrets
```bash
kubectl create secret generic eclss-secrets \
  --from-literal=jwt-secret=$(openssl rand -base64 32) \
  --from-literal=mqtt-password=$(openssl rand -base64 16) \
  --from-literal=influx-token=$(uuidgen)
```

### 3. Deploy Services
```bash
kubectl apply -f kubernetes/configmap.yaml
kubectl apply -f kubernetes/deployment.yaml
kubectl apply -f kubernetes/service.yaml
kubectl apply -f kubernetes/ingress.yaml
```

### 4. Verify Deployment
```bash
kubectl get pods
kubectl logs -f deployment/eclss-backend
```

## Option 3: AWS ECS

### 1. Create ECR Repository
```bash
aws ecr create-repository --repository-name eclss-backend
aws ecr create-repository --repository-name eclss-frontend
```

### 2. Push Images
```bash
docker tag eclss:latest {account-id}.dkr.ecr.us-east-1.amazonaws.com/eclss-backend:latest
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin {account-id}.dkr.ecr.us-east-1.amazonaws.com
docker push {account-id}.dkr.ecr.us-east-1.amazonaws.com/eclss-backend:latest
```

### 3. Create ECS Task Definition
```bash
aws ecs register-task-definition --cli-input-json file://task-definition.json
```

### 4. Create ECS Service
```bash
aws ecs create-service --cluster eclss-cluster \
  --service-name eclss-backend \
  --task-definition eclss-backend:1 \
  --desired-count 2 \
  --launch-type FARGATE
```

## Post-Deployment

### 1. Verify Services
```bash
# EMQX Admin Panel
open http://localhost:18083
# Login: admin/public

# InfluxDB
open http://localhost:8086

# Grafana
open http://localhost:3001
# Login: admin/admin

# Backend API
curl http://localhost:5000/api/state
```

### 2. Initialize Databases
```bash
# Create InfluxDB bucket
influx bucket create \
  --name eclss-telemetry \
  --org mars-society-kenya \
  --retention 30d

# Run database migrations
cd cloud && npm run migrate
```

### 3. Load Grafana Dashboards
```bash
curl -X POST http://localhost:3001/api/dashboards/db \
  -H "Content-Type: application/json" \
  -d @monitoring/grafana/dashboards/eclss-overview.json
```

### 4. Setup Monitoring Alerts
```bash
kubectl apply -f monitoring/alerting/rules.yaml
```

### 5. Test Crew Management
```bash
# Add test crew member
curl -X POST http://localhost:5000/api/crew \
  -H "Content-Type: application/json" \
  -d '{
    "crew_id": "crew_test_001",
    "name": "Test Crew Member",
    "role": "Scientist"
  }'

# Verify
curl http://localhost:5000/api/crew/crew_test_001
```

### 6. Test Telemetry Pipeline
```bash
# Publish test telemetry
mqtt_pub -h localhost -t 'eclss/digesters/temperature' \
  -m '{"value": 37.5, "unit": "celsius", "timestamp": '$(date +%s)000'}'

# Query from backend
curl 'http://localhost:5000/api/telemetry/eclss_digesters?range=-1h'
```

## Scaling

### Horizontal Scaling (Kubernetes)
```bash
kubectl scale deployment eclss-backend --replicas=3
```

### Vertical Scaling (Pod Resources)
```bash
kubectl set resources deployment eclss-backend \
  --requests=cpu=1,memory=2Gi \
  --limits=cpu=2,memory=4Gi
```

### Database Scaling (InfluxDB)
```bash
# Enable clustering for HA
influx cluster create-config \
  --address=influxdb-0:8088 \
  --address=influxdb-1:8088 \
  --address=influxdb-2:8088
```

## Backup & Recovery

### Backup Strategy
```bash
# InfluxDB Backup (daily)
kubectl exec influxdb-0 -- influx backup \
  -b eclss-telemetry \
  /var/lib/influxdb2/backup

# Upload to S3
aws s3 sync /backups/influxdb s3://eclss-backups/influxdb/ --delete
```

### Recovery Procedure
```bash
# 1. Stop services
kubectl scale deployment eclss-backend --replicas=0

# 2. Restore database
kubectl exec influxdb-0 -- influx restore /var/lib/influxdb2/backup

# 3. Restart services
kubectl scale deployment eclss-backend --replicas=2

# 4. Verify
curl http://localhost:5000/health
```

## Rollback Procedure

```bash
# If deployment fails, rollback to previous version
kubectl rollout undo deployment/eclss-backend

# Verify rollback
kubectl rollout status deployment/eclss-backend
```

## Cost Estimation

### Local (Habitat)
- Hardware: ~$50k (edge compute + storage)
- Networking: ~$2k/year (local mesh)
- **Total**: One-time infrastructure cost

### Cloud (Mission Control Centre)
- Compute: ~$500/month (2x t3.large)
- Database: ~$300/month (managed InfluxDB)
- Networking: ~$100/month (data transfer)
- Storage: ~$50/month (backups)
- **Total**: ~$1,000/month

## Performance Benchmarks

### Latency
- MQTT Pub/Sub: <50ms
- API Response: <200ms
- Database Query: <100ms
- UI Update: <500ms

### Throughput
- Telemetry Points: 1,000/sec
- Concurrent Users: 100+
- Event Processing: 10,000/sec
- Disk I/O: 100MB/sec

### Resource Usage
- Backend CPU: <20% @ 1k telemetry/sec
- Backend Memory: <2GB
- Database CPU: <30% @ 10k points/sec
- Database Memory: <4GB

## Troubleshooting

### Services Won't Start
```bash
# Check logs
docker-compose logs emqx
docker-compose logs influxdb

# Check port availability
lsof -i :1883  # MQTT
lsof -i :8086  # InfluxDB
lsof -i :5000  # Backend
```

### High Latency
```bash
# Check MQTT broker load
mqtt_clients  # via EMQX dashboard

# Check database performance
influx measurement stats

# Scale up if needed
docker-compose up -d --scale backend=3
```

### Data Loss
```bash
# Check retention policies
influx bucket list

# Verify backups
ls -lah /backups/influxdb/

# Restore if needed
kubectl exec influxdb-0 -- influx restore /backup/path
```

## Disaster Recovery Plan

1. **Detection**: Automated monitoring alerts (Prometheus + AlertManager)
2. **Assessment**: Incident commander investigates
3. **Mitigation**: Failover to standby systems
4. **Recovery**: Data restore from backups
5. **Validation**: Full system health check
6. **Documentation**: Post-incident review

RTO (Recovery Time Objective): <5 minutes
RPO (Recovery Point Objective): <1 minute

---

For detailed troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
