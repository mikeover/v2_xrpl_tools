export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthCheckResult {
  status: HealthStatus;
  timestamp: Date;
  details?: string;
  error?: string;
  latencyMs?: number;
}

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  details: HealthCheckResult;
  dependencies?: ComponentHealth[];
}

export interface SystemHealth {
  status: HealthStatus;
  version: string;
  uptime: number;
  timestamp: Date;
  components: {
    database: ComponentHealth;
    xrplConnection: ComponentHealth;
    messageQueue: ComponentHealth;
    redis?: ComponentHealth;
    metadataEnrichment: ComponentHealth;
    alertProcessing: ComponentHealth;
    notifications: ComponentHealth;
  };
  checks: {
    endToEnd?: EndToEndHealthCheck;
  };
}

export interface EndToEndHealthCheck {
  status: HealthStatus;
  lastTestAt: Date | undefined;
  lastSuccessAt: Date | undefined;
  failureCount: number;
  details: {
    transactionProcessed?: boolean;
    alertMatched?: boolean;
    notificationSent?: boolean;
    totalTimeMs?: number;
    error?: string;
  };
}

export interface HealthMetrics {
  transactions: {
    processed: number;
    failed: number;
    rate: number; // per minute
  };
  alerts: {
    total: number;
    active: number;
    matched: number;
  };
  notifications: {
    sent: number;
    failed: number;
    pending: number;
  };
  metadata: {
    enriched: number;
    failed: number;
    queued: number;
  };
}