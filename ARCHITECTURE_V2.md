# Architecture V2: XRP Ledger NFT Activity Monitoring System

## Executive Summary

This document outlines the architecture for a robust, scalable system designed to monitor and process NFT-related activities on the XRP Ledger in real-time. The system provides configurable alerts for users based on NFT listings, mints, and sales, with support for collection and trait-based filtering.

## System Overview

### Core Requirements
- Real-time processing of XRPL transactions as they're confirmed
- Comprehensive handling of NFT activities (mints, sales, offers)
- Metadata and image fetching with S3 caching
- User-configurable notifications with collection and trait filtering
- Resilience to XRPL connection issues
- Support for existing NFTs (retroactive metadata fetching)

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           User Interface Layer                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐ │
│  │   Web App   │  │  Mobile App  │  │   REST API  │  │  WebSocket   │ │
│  └─────────────┘  └──────────────┘  └─────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────────────────────────────────────────┐
│                          Application Layer                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    API Gateway & Load Balancer                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                      │                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ Alert Config │  │   User Mgmt  │  │ Notification │  │  Analytics│  │
│  │   Service    │  │   Service    │  │   Service    │  │  Service  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────────────────────────────────────────┐
│                         Core Processing Layer                            │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    Event Processing Pipeline                     │   │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌───────────┐│   │
│  │  │Transaction │  │   Event    │  │ Enrichment │  │  Matcher  ││   │
│  │  │  Ingestion │→ │ Classifier │→ │  Service   │→ │  Service  ││   │
│  │  └────────────┘  └────────────┘  └────────────┘  └───────────┘│   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                 │
│  │   Metadata   │  │    Image     │  │    Queue     │                 │
│  │   Fetcher    │  │   Processor  │  │   Manager    │                 │
│  └──────────────┘  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
┌─────────────────────────────────────────────────────────────────────────┐
│                         Infrastructure Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │ XRPL Connect │  │  PostgreSQL  │  │    Redis     │  │    S3     │  │
│  │   Manager    │  │   Cluster    │  │   Cluster    │  │  Storage  │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └───────────┘  │
│                                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │Message Queue │  │  Monitoring  │  │   Logging    │  │  Metrics  │  │
│  │ (RabbitMQ)   │  │ (Prometheus) │  │    (ELK)     │  │ (Grafana) │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  └───────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Detailed Component Design

### 1. XRPL Connection Manager

**Purpose**: Maintain reliable connections to XRPL nodes with automatic failover and recovery.

**Key Features**:
- Multi-node connection pool with health monitoring
- Automatic reconnection with exponential backoff
- Load balancing across healthy nodes
- Connection state management and circuit breakers
- Ledger gap detection and recovery

**Implementation**:
```typescript
interface XRPLConnectionManager {
  // Connection pool management
  addNode(url: string, priority: number): void;
  removeNode(url: string): void;
  getHealthyConnection(): XRPLClient;
  
  // Subscription management
  subscribeLedger(callback: LedgerCallback): Subscription;
  subscribeTransactions(callback: TransactionCallback): Subscription;
  
  // Gap detection and recovery
  detectLedgerGaps(): LedgerGap[];
  backfillLedgerRange(start: number, end: number): Promise<void>;
  
  // Health monitoring
  getConnectionHealth(): ConnectionHealthStatus;
  registerHealthCheck(callback: HealthCheckCallback): void;
}
```

### 2. Transaction Processing Pipeline

**Purpose**: Efficiently process incoming transactions and identify NFT-related activities.

**Components**:

#### 2.1 Transaction Ingestion Service
- Subscribes to ledger stream via WebSocket
- Validates transaction integrity
- Deduplicates transactions
- Publishes to event stream

#### 2.2 Event Classifier
- Identifies NFT-related transaction types:
  - NFTokenMint
  - NFTokenCreateOffer
  - NFTokenAcceptOffer
  - NFTokenCancelOffer
  - NFTokenBurn
- Extracts relevant data (NFTokenID, issuer, price, etc.)
- Tags transactions with activity type (mint, sale, offer)

#### 2.3 Enrichment Service
- Fetches missing data from XRPL or xrpldata API
- Retrieves NFT metadata from IPFS/HTTP URIs
- Downloads and processes images
- Calculates derived metrics (price changes, rarity scores)

#### 2.4 Matcher Service
- Matches enriched events against user alert configurations
- Supports complex matching rules:
  - Collection filters (issuerID + taxon)
  - Trait filters with AND/OR logic
  - Price range filters
  - Activity type filters
- Generates notification events

### 3. Metadata & Image Management

**Metadata Fetcher**:
```typescript
interface MetadataFetcher {
  fetchMetadata(nftId: string, uri: string): Promise<NFTMetadata>;
  
  // Retry logic with circuit breaker
  retryWithBackoff<T>(
    fn: () => Promise<T>, 
    maxRetries: number,
    backoffMs: number
  ): Promise<T>;
  
  // IPFS gateway rotation
  getNextIPFSGateway(): string;
  
  // Caching
  getCachedMetadata(nftId: string): Promise<NFTMetadata | null>;
  cacheMetadata(nftId: string, metadata: NFTMetadata): Promise<void>;
}
```

**Image Processor**:
- Downloads images from various sources (IPFS, HTTP, Arweave)
- Generates thumbnails and optimized versions
- Uploads to S3 with CDN distribution
- Implements retry logic with fallback gateways

### 4. Queue Management System

**Architecture**:
- Use RabbitMQ or AWS SQS for reliable message processing
- Separate queues for different priority levels
- Dead letter queues for failed processing
- Queue consumers with configurable concurrency

**Queue Types**:
1. **High Priority**: Real-time transaction processing
2. **Medium Priority**: Metadata fetching
3. **Low Priority**: Image processing, analytics
4. **Retry Queue**: Failed operations with exponential backoff
5. **Dead Letter Queue**: Permanently failed items for manual review

### 5. Notification System

**Components**:
- Template engine for notification formatting
- Multi-channel delivery (Discord, Email, Webhook, WebSocket)
- Rate limiting per user/channel
- Delivery tracking and retry logic
- User preference management

**Notification Flow**:
```
Event Match → Template Rendering → Channel Router → Delivery Agent → Tracking
```

### 6. Data Models

**Core Entities**:

```sql
-- NFT Collections
CREATE TABLE collections (
  id UUID PRIMARY KEY,
  issuer_address VARCHAR(64) NOT NULL,
  taxon INTEGER NOT NULL,
  name VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  UNIQUE(issuer_address, taxon)
);

-- NFTs
CREATE TABLE nfts (
  id UUID PRIMARY KEY,
  nft_id VARCHAR(64) UNIQUE NOT NULL,
  collection_id UUID REFERENCES collections(id),
  owner_address VARCHAR(64) NOT NULL,
  metadata_uri TEXT,
  metadata JSONB,
  traits JSONB,
  image_url TEXT,
  cached_image_url TEXT,
  last_activity_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

-- NFT Activities
CREATE TABLE nft_activities (
  id UUID PRIMARY KEY,
  nft_id UUID REFERENCES nfts(id),
  transaction_hash VARCHAR(64) NOT NULL,
  ledger_index BIGINT NOT NULL,
  activity_type VARCHAR(32) NOT NULL, -- mint, sale, offer_created, offer_accepted
  from_address VARCHAR(64),
  to_address VARCHAR(64),
  price_drops BIGINT,
  currency VARCHAR(40),
  issuer VARCHAR(64),
  timestamp TIMESTAMP NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL
);

-- User Alert Configurations
CREATE TABLE alert_configs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  collection_id UUID REFERENCES collections(id),
  activity_types TEXT[], -- ['mint', 'sale', 'offer']
  min_price_drops BIGINT,
  max_price_drops BIGINT,
  trait_filters JSONB, -- Complex trait filtering rules
  notification_channels JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

-- Notification Queue
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  alert_config_id UUID REFERENCES alert_configs(id),
  activity_id UUID REFERENCES nft_activities(id),
  channel VARCHAR(32) NOT NULL,
  status VARCHAR(32) NOT NULL, -- pending, sent, failed
  retry_count INTEGER DEFAULT 0,
  scheduled_at TIMESTAMP NOT NULL,
  sent_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP NOT NULL
);

-- Ledger Tracking
CREATE TABLE ledger_sync_status (
  id UUID PRIMARY KEY,
  ledger_index BIGINT UNIQUE NOT NULL,
  ledger_hash VARCHAR(64) NOT NULL,
  close_time TIMESTAMP NOT NULL,
  transaction_count INTEGER NOT NULL,
  processed_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL
);
```

### 7. Resilience & Error Handling

**Circuit Breaker Pattern**:
- Implement circuit breakers for all external service calls
- States: Closed → Open → Half-Open
- Configurable failure thresholds and recovery times

**Retry Strategies**:
- Exponential backoff with jitter
- Different retry policies for different operation types
- Maximum retry limits with dead letter queue fallback

**Health Checks**:
- Component-level health endpoints
- Dependency health aggregation
- Automated alerts for degraded services

**Graceful Degradation**:
- Cache fallbacks when services are unavailable
- Queue buffering during outages
- Partial functionality maintenance

### 8. Monitoring & Observability

**Metrics Collection**:
- Transaction processing rate
- Queue depths and processing times
- API response times
- Cache hit rates
- Error rates by component

**Logging Strategy**:
- Structured logging with correlation IDs
- Log aggregation with ELK stack
- Different log levels for different environments

**Alerting Rules**:
- XRPL connection failures
- Queue backup thresholds
- High error rates
- Performance degradation

### 9. Scaling Considerations

**Horizontal Scaling**:
- Stateless service design
- Load balancing at API gateway
- Distributed queue processing
- Database read replicas

**Caching Strategy**:
- Redis for hot data (active NFT metadata)
- S3 for cold storage (images, historical data)
- CDN for static assets
- Application-level caching for computed data

**Performance Optimizations**:
- Batch processing for bulk operations
- Async processing for non-critical paths
- Database query optimization
- Connection pooling

## Security Considerations

1. **API Security**:
   - Rate limiting per user/IP
   - JWT-based authentication
   - API key management for services
   - Request validation and sanitization

2. **Data Protection**:
   - Encryption at rest (S3, database)
   - Encryption in transit (TLS)
   - PII data minimization
   - GDPR compliance considerations

3. **Infrastructure Security**:
   - VPC isolation
   - Security groups and NACLs
   - Secrets management (AWS Secrets Manager)
   - Regular security audits

## Deployment Architecture

**Container Orchestration**:
- Kubernetes for container management
- Helm charts for deployment configuration
- Horizontal pod autoscaling
- Rolling updates with zero downtime

**CI/CD Pipeline**:
1. Code commit triggers build
2. Run tests and security scans
3. Build Docker images
4. Deploy to staging environment
5. Run integration tests
6. Deploy to production with canary deployment
7. Monitor metrics and rollback if needed

## Technology Stack

**Core Technologies**:
- **Language**: TypeScript/Node.js for consistency
- **Framework**: NestJS for enterprise-grade structure
- **Database**: PostgreSQL with TimescaleDB for time-series data
- **Cache**: Redis Cluster
- **Queue**: RabbitMQ or AWS SQS
- **Storage**: AWS S3 with CloudFront CDN

**Supporting Tools**:
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK Stack (Elasticsearch, Logstash, Kibana)
- **Tracing**: Jaeger or AWS X-Ray
- **Container**: Docker + Kubernetes
- **CI/CD**: GitLab CI or GitHub Actions

## Implementation Timeline

### Week 1-2: Foundation
- Set up development environment and infrastructure
- Implement XRPL connection manager with multi-node support
- Create basic transaction ingestion pipeline
- Set up database schema and models
- Implement core error handling and logging

### Week 3-4: Transaction Processing
- Build event classification system for NFT transactions
- Implement transaction deduplication
- Create enrichment service for metadata
- Set up message queue infrastructure
- Build basic notification system

### Week 5-6: Metadata & Storage
- Implement metadata fetching with IPFS support
- Build image processing pipeline
- Set up S3 integration for caching
- Implement retry logic and circuit breakers
- Create metadata indexing system

### Week 7-8: User Features
- Build alert configuration API
- Implement user management system
- Create notification matching engine
- Set up Discord integration
- Build basic web interface

### Week 9-10: Scalability & Reliability
- Implement Redis caching layer
- Set up horizontal scaling
- Add comprehensive monitoring
- Implement health checks
- Performance optimization

### Week 11-12: Production Readiness
- Security hardening
- Load testing
- Documentation
- Deployment automation
- Operational procedures

## Key Design Principles

1. **Event-Driven Architecture**: All components communicate through events for loose coupling
2. **Microservices**: Each service has a single responsibility and can scale independently
3. **Resilience First**: Every external call has timeout, retry, and circuit breaker protection
4. **Observable**: Every action is logged, measured, and traceable
5. **Cache Everything**: Multiple caching layers to minimize external calls
6. **Queue-Based Processing**: Asynchronous processing for better reliability
7. **Stateless Services**: All state in databases or caches for easy scaling

## Success Metrics

- **Performance**: Process 1000+ transactions per second
- **Reliability**: 99.9% uptime with automatic failover
- **Latency**: < 100ms API response time (p95)
- **Scalability**: Support 100,000+ concurrent users
- **Accuracy**: 100% transaction processing accuracy

## Risk Mitigation

1. **XRPL Node Failures**: Multiple node connections with automatic failover
2. **IPFS Gateway Issues**: Multiple gateway options with fallback strategies
3. **Database Overload**: Read replicas and caching strategies
4. **Queue Backup**: Dead letter queues and monitoring alerts
5. **Security Breaches**: Regular audits and penetration testing

## Future Enhancements

1. **Machine Learning**: Price prediction and anomaly detection
2. **Advanced Analytics**: Real-time dashboards and reporting
3. **Mobile Apps**: Native iOS and Android applications
4. **Multi-chain Support**: Extend to other blockchains
5. **AI-Powered Insights**: Automated trading recommendations