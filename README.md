# XRPL NFT Activity Monitor

A real-time monitoring system for NFT activities on the XRP Ledger, providing configurable alerts and notifications for NFT listings, sales, mints, and transfers.

## 🚀 Features

- **Real-time Monitoring**: Connects to XRPL nodes for live transaction monitoring
- **NFT Activity Detection**: Automatically detects and classifies NFT-related transactions
- **Configurable Alerts**: Set up custom alerts based on collections, price ranges, and activity types
- **Multi-channel Notifications**: Receive alerts via Discord, Email, or Webhooks
- **Metadata Enrichment**: Fetches and caches NFT metadata from IPFS and HTTP sources
- **High Performance**: Redis caching and efficient batch processing
- **REST API**: Comprehensive API with Swagger documentation
- **Health Monitoring**: Built-in health checks and monitoring endpoints

## 🏗 Architecture

The system uses a modular, event-driven architecture:

```
XRPL Nodes → Transaction Processor → Alert Matcher → Notification Dispatcher
                    ↓                      ↓              ↓
              NFT Metadata           Alert Storage   Delivery Channels
              Enrichment              (PostgreSQL)   (Discord/Email/Webhook)
```

## 📋 Prerequisites

- Node.js 18+ and npm
- PostgreSQL 14+ with TimescaleDB extension
- Redis 6+
- RabbitMQ 3.11+
- Docker (optional, for dependencies)

## 🛠 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd v2_xrpl_tools
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Start infrastructure services**
   ```bash
   # Using Docker Compose (recommended)
   docker-compose up -d postgres redis rabbitmq

   # Or install and run services manually
   ```

5. **Run database migrations**
   ```bash
   npm run migration:run
   ```

6. **Start the application**
   ```bash
   # Development
   npm run start:dev

   # Production
   npm run build
   npm run start:prod
   ```

## 🔧 Configuration

### Required Environment Variables

```bash
# Database
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USERNAME=postgres
DATABASE_PASSWORD=postgres
DATABASE_NAME=xrpl_nft_monitor

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=              # Optional

# RabbitMQ
RABBITMQ_URL=amqp://rabbitmq:rabbitmq@localhost:5672

# XRPL Connection (Required for monitoring)
XRPL_WSS_URLS=wss://xrplcluster.com,wss://s2.ripple.com
XRPL_NETWORK=mainnet

# Authentication
JWT_SECRET=your-secret-key-change-this
JWT_EXPIRATION=7d

# Notifications (Optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
SENDGRID_API_KEY=SG.xxx
EMAIL_FROM=noreply@example.com

# AWS S3 (Optional, for image caching)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
S3_BUCKET_NAME=xrpl-nft-images
```

### Optional Environment Variables

```bash
# Performance Tuning
REDIS_TTL=3600              # Cache TTL in seconds
RABBITMQ_PREFETCH_COUNT=10  # Queue consumer prefetch
BATCH_SIZE=100              # Transaction batch size

# Processing Mode (NEW!)
USE_QUEUE_CONSUMERS=true    # Use queue-based processing (recommended for production)

# XRPL Connection
XRPL_RECONNECT_INTERVAL=5000     # ms between reconnection attempts
XRPL_MAX_RECONNECT_ATTEMPTS=10   # Maximum reconnection attempts
XRPL_HEALTH_CHECK_INTERVAL=30000 # ms between health checks

# Security
BCRYPT_SALT_ROUNDS=10       # Password hashing rounds
THROTTLE_TTL=60000          # Rate limit window (ms)
THROTTLE_LIMIT=100          # Requests per window
```

## 📚 API Documentation

Once the application is running, access the interactive API documentation at:
- Swagger UI: `http://localhost:3110/api/docs`
- API Info: `http://localhost:3110/api`

### Key Endpoints

#### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login
- `GET /api/v1/auth/profile` - Get user profile

#### Alerts
- `GET /api/v1/alerts` - List user's alerts
- `POST /api/v1/alerts` - Create new alert
- `PUT /api/v1/alerts/:id` - Update alert
- `DELETE /api/v1/alerts/:id` - Delete alert
- `POST /api/v1/alerts/:id/test` - Test alert

#### Health
- `GET /health` - Basic health check
- `GET /health/system` - Detailed system health
- `GET /health/metrics` - System metrics

## 🚦 Getting Started

1. **Register a user account**
   ```bash
   curl -X POST http://localhost:3110/api/v1/auth/register \
     -H "Content-Type: application/json" \
     -d '{
       "email": "user@example.com",
       "password": "securepassword",
       "name": "Your Name",
       "xrplAddress": "rYourXRPLAddress" # Optional
     }'
   ```

2. **Login to get JWT token**
   ```bash
   curl -X POST http://localhost:3110/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "email": "user@example.com",
       "password": "securepassword"
     }'
   ```

3. **Create an alert** (use JWT token from login)
   ```bash
   curl -X POST http://localhost:3110/api/v1/alerts \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Cool Cats Sales",
       "enabled": true,
       "alertType": "collection",
       "conditions": {
         "collectionTaxon": 12345,
         "activityTypes": ["sale", "listing"],
         "minPriceDrops": "1000000",
         "maxPriceDrops": "10000000"
       },
       "notificationChannels": {
         "discord": {
           "enabled": true,
           "webhookUrl": "https://discord.com/api/webhooks/..."
         }
       }
     }'
   ```

## 🔍 Monitoring

### Health Checks
- Basic health: `GET /health`
- Kubernetes liveness: `GET /health/live`
- Kubernetes readiness: `GET /health/ready`
- System health: `GET /health/system`

### Metrics
Access system metrics at `GET /health/metrics` for:
- Transaction processing rate
- Alert matching statistics
- Notification delivery status
- Cache hit rates

## 🐛 Troubleshooting

### Common Issues

1. **"XRPL not connected" error**
   - Ensure `XRPL_WSS_URLS` is set with valid WebSocket URLs
   - Check firewall settings for WebSocket connections
   - Try public nodes: `wss://xrplcluster.com,wss://s2.ripple.com`

2. **"No users found in system" in e2e health check**
   - The system needs at least one registered user
   - Register a user via the API first

3. **Notifications not being sent**
   - Verify notification channel credentials (Discord webhook, SendGrid API key)
   - Check notification channel is enabled in alert configuration
   - Review logs for delivery errors

4. **High memory usage**
   - Adjust `BATCH_SIZE` for transaction processing
   - Configure Redis memory limits
   - Check for memory leaks in logs

5. **Choosing Processing Mode**
   - `USE_QUEUE_CONSUMERS=false`: Direct XRPL subscription (simpler, good for development)
   - `USE_QUEUE_CONSUMERS=true`: Queue-based processing (recommended for production/scaling)
   - For mainnet with high volume, always use queue-based processing

### Logs

The application uses structured logging. Key log locations:
- Application logs: stdout (use `npm run start:dev | tee app.log`)
- Error logs: stderr
- Database queries: Enable with `NODE_ENV=development`

## 🧪 Development

### Running Tests
```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

### Code Quality
```bash
# Linting
npm run lint

# Format code
npm run format
```

### Database Management
```bash
# Create new migration
npm run migration:create --name=AddNewFeature

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert
```

## 🚀 Deployment

### Docker Deployment
```bash
# Build Docker image
docker build -t xrpl-nft-monitor .

# Run with Docker Compose
docker-compose up -d
```

### Kubernetes Deployment
See `k8s/` directory for Kubernetes manifests.

### Environment-specific Configuration
- Development: `.env.development`
- Production: `.env.production`
- Test: `.env.test`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Built with [NestJS](https://nestjs.com/)
- XRPL integration using [xrpl.js](https://github.com/XRPLF/xrpl.js)
- Real-time capabilities powered by [RabbitMQ](https://www.rabbitmq.com/)
- Caching by [Redis](https://redis.io/)
- Data persistence with [PostgreSQL](https://www.postgresql.org/) and [TimescaleDB](https://www.timescale.com/)