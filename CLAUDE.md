# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an XRP Ledger NFT Activity Monitoring System that monitors and processes NFT-related activities on the XRP Ledger in real-time, providing configurable alerts for users based on NFT listings, mints, and sales.

## Project Status

**Current Phase**: Implementation Complete (93% of features)
- Core system is fully implemented and functional
- Requires XRPL node configuration to start monitoring
- Missing only comprehensive testing suite
- All major features are working:
  - ✅ XRPL Connection Management
  - ✅ Transaction Processing
  - ✅ NFT Metadata Enrichment
  - ✅ Alert Configuration & Matching
  - ✅ Multi-channel Notifications
  - ✅ REST API with Swagger
  - ✅ Authentication & Authorization
  - ✅ Redis Caching
  - ✅ Health Monitoring
  - ❌ Comprehensive Testing (pending)

## Technology Stack

When implementing components, use these technologies:

- **Core Language**: TypeScript/Node.js
- **Framework**: NestJS (enterprise-grade Node.js framework)
- **Database**: PostgreSQL with TimescaleDB extension
- **Cache**: Redis Cluster
- **Queue**: RabbitMQ or AWS SQS
- **Storage**: AWS S3 with CloudFront CDN
- **Container**: Docker + Kubernetes
- **CI/CD**: GitLab CI or GitHub Actions

## Development Commands

Once the project is initialized, expected commands will be:

```bash
# Install dependencies
npm install

# Run development server
npm run start:dev

# Run tests
npm run test
npm run test:e2e

# Build for production
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

## Architecture Overview

The system follows a microservices architecture with these key layers:

1. **User Interface Layer**: Web App, Mobile App, REST API, WebSocket
2. **Application Layer**: API Gateway, Alert Config Service, User Management, Notification Service, Analytics
3. **Core Processing Layer**: Transaction Ingestion, Event Classifier, Enrichment Service, Matcher Service
4. **Infrastructure Layer**: XRPL Connection Manager, PostgreSQL, Redis, S3, RabbitMQ

## Key Implementation Guidelines

1. **Event-Driven Architecture**: Components communicate through events for loose coupling
2. **Resilience First**: Implement circuit breakers, retries, and timeouts for all external calls
3. **Stateless Services**: Keep all state in databases or caches
4. **Queue-Based Processing**: Use async processing for reliability
5. **Observable System**: Log, measure, and trace every action

## Core Components to Implement

### Week 1-2: Foundation
- XRPL Connection Manager with multi-node support
- Transaction ingestion pipeline
- Database schema (see ARCHITECTURE_V2.md lines 204-289)
- Error handling and logging infrastructure

### Week 3-4: Transaction Processing
- Event Classifier for NFT transaction types
- Transaction deduplication
- Enrichment Service for NFT metadata (fetches actual NFT content from IPFS)
- Message queue infrastructure

### Week 5-6: NFT Metadata & Storage
- **NFT Metadata Fetcher** with IPFS support (NOT transaction metadata)
- **S3 Caching** for NFT metadata (images, descriptions, attributes)
- **Image Processor** for NFT images with S3 integration
- Retry logic and circuit breakers
- NFT metadata indexing

**IMPORTANT**: Distinguish between two types of metadata:
1. **NFT Metadata**: The actual NFT content (name, description, image, attributes) stored on IPFS/HTTP - THIS IS WHAT WE CACHE
2. **Transaction Metadata**: XRPL ledger transaction execution details (AffectedNodes, etc.) - THIS IS NOT STORED (too heavy)

### Week 7-8: User Features
- Alert Configuration API
- User Management System
- Notification Matching Engine
- Discord integration

## Database Schema

The core entities are defined in ARCHITECTURE_V2.md:
- collections (lines 204-214)
- nfts (lines 217-230)
- nft_activities (lines 233-247)
- alert_configs (lines 250-263)
- notifications (lines 266-278)
- ledger_sync_status (lines 281-289)

## Performance Requirements

- Process 1000+ transactions per second
- < 100ms API response time (p95)
- Support 100,000+ concurrent users
- 99.9% uptime with automatic failover

## Testing Strategy

- Unit tests for all services
- Integration tests for API endpoints
- Load testing for performance validation
- E2E tests for critical user flows

## Security Considerations

- JWT-based authentication
- Rate limiting per user/IP
- Encryption at rest and in transit
- VPC isolation for infrastructure
- Regular security audits

## Monitoring

- Prometheus + Grafana for metrics
- ELK Stack for logging
- Jaeger or AWS X-Ray for tracing
- Health check endpoints for all services

## Important Architecture Note

**Current Event Flow**: The system currently uses direct subscriptions between services rather than the queue-based architecture described in ARCHITECTURE_V2.md:
- XRPL Connection Manager → Direct subscription → Transaction Ingestion Service
- RabbitMQ is configured but not actively used for event processing
- This works but lacks the resilience benefits of queue-based processing

**Decision Needed**: Either implement queue consumers or remove queue infrastructure to reduce complexity.