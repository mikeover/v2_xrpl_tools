import { Client } from 'xrpl';
import { 
  XRPLTransactionStreamMessage, 
  XRPLLedgerStreamMessage 
} from '../../../shared/types/xrpl-stream.types';

export interface XRPLNode {
  url: string;
  priority: number;
  isHealthy: boolean;
  lastHealthCheck: Date;
  consecutiveFailures: number;
}

export interface ConnectionHealthStatus {
  totalNodes: number;
  healthyNodes: number;
  unhealthyNodes: number;
  nodes: Array<{
    url: string;
    isHealthy: boolean;
    lastError?: string | undefined;
    latency?: number | undefined;
  }>;
}

export interface LedgerGap {
  startLedger: number;
  endLedger: number;
  size: number;
  detectedAt: Date;
}

export interface LedgerStreamMessage extends XRPLLedgerStreamMessage {}

export interface TransactionStreamMessage extends XRPLTransactionStreamMessage {}

export type LedgerCallback = (ledger: LedgerStreamMessage) => void;
export type TransactionCallback = (transaction: TransactionStreamMessage) => void;
export type HealthCheckCallback = (status: ConnectionHealthStatus) => void;

export interface Subscription {
  id: string;
  unsubscribe: () => void;
}

export interface XRPLConnectionConfig {
  nodes: Array<{
    url: string;
    priority?: number;
  }>;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  healthCheckInterval?: number;
  connectionTimeout?: number;
  maxConsecutiveFailures?: number;
}

export interface IXRPLConnectionManager {
  // Connection pool management
  addNode(url: string, priority: number): void;
  removeNode(url: string): void;
  getHealthyConnection(): Promise<Client>;

  // Subscription management
  subscribeLedger(callback: LedgerCallback): Subscription;
  subscribeTransactions(callback: TransactionCallback): Subscription;

  // Gap detection and recovery
  detectLedgerGaps(): LedgerGap[];
  backfillLedgerRange(start: number, end: number): Promise<void>;

  // Health monitoring
  getConnectionHealth(): ConnectionHealthStatus;
  registerHealthCheck(callback: HealthCheckCallback): void;

  // Lifecycle
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
}
