import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Client } from 'xrpl';
import { Subject } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import CircuitBreaker from 'opossum';
import { LoggerService } from '../../../core/logger/logger.service';
import { ConfigService } from '@nestjs/config';
import { AppConfiguration } from '../../../shared/config/configuration';
import { retry } from '../utils/retry.util';
import {
  IXRPLConnectionManager,
  XRPLNode,
  ConnectionHealthStatus,
  LedgerGap,
  LedgerCallback,
  TransactionCallback,
  HealthCheckCallback,
  Subscription,
  LedgerStreamMessage,
  TransactionStreamMessage,
} from '../interfaces/connection.interface';
import { XRPL_CONSTANTS, XRPL_ERRORS } from '../constants/xrpl.constants';

@Injectable()
export class XRPLConnectionManagerService
  implements IXRPLConnectionManager, OnModuleInit, OnModuleDestroy
{
  private nodes: Map<string, XRPLNode> = new Map();
  private connections: Map<string, Client> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  private ledgerSubscriptions: Map<string, LedgerCallback> = new Map();
  private transactionSubscriptions: Map<string, TransactionCallback> = new Map();
  private healthCheckCallbacks: Set<HealthCheckCallback> = new Set();

  private ledgerSubject = new Subject<LedgerStreamMessage>();
  private transactionSubject = new Subject<TransactionStreamMessage>();

  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastSeenLedger: number = 0;
  private ledgerGaps: LedgerGap[] = [];

  private readonly reconnectInterval: number;
  private readonly healthCheckIntervalMs: number;
  private readonly connectionTimeout: number;
  private readonly maxConsecutiveFailures: number;

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService<AppConfiguration>,
  ) {
    const xrplConfig = this.configService.get('xrpl', { infer: true });

    this.reconnectInterval =
      xrplConfig?.reconnectInterval ?? XRPL_CONSTANTS.DEFAULT_RECONNECT_INTERVAL;
    this.healthCheckIntervalMs =
      xrplConfig?.healthCheckInterval ?? XRPL_CONSTANTS.DEFAULT_HEALTH_CHECK_INTERVAL;
    this.connectionTimeout =
      xrplConfig?.connectionTimeout ?? XRPL_CONSTANTS.DEFAULT_CONNECTION_TIMEOUT;
    this.maxConsecutiveFailures =
      xrplConfig?.maxConsecutiveFailures ?? XRPL_CONSTANTS.DEFAULT_MAX_CONSECUTIVE_FAILURES;
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing XRPL Connection Manager');

    // Add configured nodes
    const xrplConfig = this.configService.get('xrpl', { infer: true });
    if (xrplConfig?.nodes) {
      for (const node of xrplConfig.nodes) {
        this.addNode(node.url, node.priority ?? 1);
      }
    } else {
      // Add default public nodes as fallback
      XRPL_CONSTANTS.PUBLIC_NODES.forEach((url, index) => {
        this.addNode(url, index + 1);
      });
    }

    await this.connect();
    this.startHealthCheck();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down XRPL Connection Manager');
    await this.disconnect();
  }

  addNode(url: string, priority: number): void {
    if (!url || !url.startsWith('ws')) {
      throw new Error(XRPL_ERRORS.INVALID_NODE_URL);
    }

    this.nodes.set(url, {
      url,
      priority,
      isHealthy: false,
      lastHealthCheck: new Date(),
      consecutiveFailures: 0,
    });

    this.logger.log(`Added XRPL node: ${url} with priority ${priority}`);
  }

  removeNode(url: string): void {
    const client = this.connections.get(url);
    if (client && client.isConnected()) {
      client.disconnect();
    }

    this.nodes.delete(url);
    this.connections.delete(url);
    this.circuitBreakers.delete(url);

    this.logger.log(`Removed XRPL node: ${url}`);
  }

  async getHealthyConnection(): Promise<Client> {
    const healthyNodes = Array.from(this.nodes.values())
      .filter((node) => node.isHealthy)
      .sort((a, b) => a.priority - b.priority);

    if (healthyNodes.length === 0) {
      throw new Error(XRPL_ERRORS.NO_HEALTHY_NODES);
    }

    // Try nodes in priority order
    for (const node of healthyNodes) {
      const client = this.connections.get(node.url);
      if (client && client.isConnected()) {
        return client;
      }
    }

    // If no connected clients, try to connect to the highest priority healthy node
    const bestNode = healthyNodes[0];
    if (!bestNode) {
      throw new Error(XRPL_ERRORS.NO_HEALTHY_NODES);
    }
    await this.connectToNode(bestNode);

    const client = this.connections.get(bestNode.url);
    if (!client || !client.isConnected()) {
      throw new Error(XRPL_ERRORS.NO_HEALTHY_NODES);
    }

    return client;
  }

  subscribeLedger(callback: LedgerCallback): Subscription {
    const id = uuidv4();
    this.ledgerSubscriptions.set(id, callback);

    return {
      id,
      unsubscribe: () => {
        this.ledgerSubscriptions.delete(id);
      },
    };
  }

  subscribeTransactions(callback: TransactionCallback): Subscription {
    const id = uuidv4();
    this.transactionSubscriptions.set(id, callback);

    return {
      id,
      unsubscribe: () => {
        this.transactionSubscriptions.delete(id);
      },
    };
  }

  detectLedgerGaps(): LedgerGap[] {
    return [...this.ledgerGaps];
  }

  async backfillLedgerRange(start: number, end: number): Promise<void> {
    this.logger.log(`Backfilling ledger range: ${start} to ${end}`);

    try {
      const client = await this.getHealthyConnection();

      for (let i = start; i <= end; i++) {
        const ledger = await retry(
          async () => {
            const response = await client.request({
              command: 'ledger',
              ledger_index: i,
              transactions: true,
              expand: true,
            });
            return response.result;
          },
          {
            retries: XRPL_CONSTANTS.RETRY_ATTEMPTS,
            minTimeout: XRPL_CONSTANTS.RETRY_MIN_TIMEOUT,
            maxTimeout: XRPL_CONSTANTS.RETRY_MAX_TIMEOUT,
            factor: XRPL_CONSTANTS.RETRY_FACTOR,
          },
        );

        // Process transactions from the backfilled ledger
        if (ledger.ledger && ledger.ledger.transactions) {
          for (const tx of ledger.ledger.transactions) {
            this.handleTransaction({
              transaction: tx,
              meta: tx.metaData,
              engine_result: tx['engine_result'] || 'tesSUCCESS',
              engine_result_code: tx['engine_result_code'] || 0,
              engine_result_message: tx['engine_result_message'] || '',
              ledger_hash: ledger.ledger.ledger_hash,
              ledger_index: ledger.ledger.ledger_index,
              validated: true,
            });
          }
        }
      }

      // Remove the gap from our tracking
      this.ledgerGaps = this.ledgerGaps.filter(
        (gap) => !(gap.startLedger === start && gap.endLedger === end),
      );

      this.logger.log(`Successfully backfilled ledger range: ${start} to ${end}`);
    } catch (error) {
      this.logger.error(
        `Failed to backfill ledger range: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(XRPL_ERRORS.BACKFILL_FAILED);
    }
  }

  getConnectionHealth(): ConnectionHealthStatus {
    const nodes = Array.from(this.nodes.values()).map((node) => {
      const client = this.connections.get(node.url);
      return {
        url: node.url,
        isHealthy: node.isHealthy,
        lastError:
          node.consecutiveFailures > 0 ? 'Connection failed' : (undefined as string | undefined),
        latency: client?.connection?.getUrl() ? 0 : undefined, // TODO: Implement proper latency measurement
      };
    });

    const healthyNodes = nodes.filter((n) => n.isHealthy).length;

    return {
      totalNodes: nodes.length,
      healthyNodes,
      unhealthyNodes: nodes.length - healthyNodes,
      nodes,
    };
  }

  registerHealthCheck(callback: HealthCheckCallback): void {
    this.healthCheckCallbacks.add(callback);
  }

  async connect(): Promise<void> {
    this.logger.log('Connecting to XRPL nodes...');

    const connectPromises = Array.from(this.nodes.values()).map((node) =>
      this.connectToNode(node).catch((error) => {
        this.logger.error(`Failed to connect to ${node.url}: ${error.message}`);
      }),
    );

    await Promise.allSettled(connectPromises);

    const healthyCount = Array.from(this.nodes.values()).filter((n) => n.isHealthy).length;
    if (healthyCount === 0) {
      throw new Error(XRPL_ERRORS.NO_HEALTHY_NODES);
    }

    this.logger.log(`Connected to ${healthyCount} XRPL nodes`);
  }

  async disconnect(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    const disconnectPromises = Array.from(this.connections.values()).map((client) =>
      client.disconnect().catch((error) => {
        this.logger.error(`Error disconnecting: ${error.message}`);
      }),
    );

    await Promise.allSettled(disconnectPromises);

    this.connections.clear();
    this.circuitBreakers.clear();
    this.ledgerSubject.complete();
    this.transactionSubject.complete();
  }

  isConnected(): boolean {
    return Array.from(this.nodes.values()).some((node) => node.isHealthy);
  }

  private async connectToNode(node: XRPLNode): Promise<void> {
    const breaker = this.getOrCreateCircuitBreaker(node.url);

    try {
      await breaker.fire(async () => {
        const client = new Client(node.url, {
          connectionTimeout: this.connectionTimeout,
        });

        await client.connect();

        // Subscribe to streams
        await client.request({
          command: 'subscribe',
          streams: ['ledger', 'transactions'],
        });

        // Set up event handlers
        client.on('ledgerClosed', (ledger) => {
          this.handleLedgerClosed(ledger);
        });

        client.on('transaction', (tx) => {
          this.handleTransaction(tx);
        });

        client.on('disconnected', () => {
          this.handleDisconnection(node);
        });

        client.on('error', (error) => {
          this.logger.error(`XRPL client error for ${node.url}: ${error.message}`);
        });

        this.connections.set(node.url, client);
        node.isHealthy = true;
        node.consecutiveFailures = 0;
        node.lastHealthCheck = new Date();

        this.logger.log(`Successfully connected to ${node.url}`);
      });
    } catch (error) {
      node.isHealthy = false;
      node.consecutiveFailures++;
      node.lastHealthCheck = new Date();

      if (node.consecutiveFailures >= this.maxConsecutiveFailures) {
        this.logger.error(`Node ${node.url} exceeded max consecutive failures`);
      }

      throw error;
    }
  }

  private getOrCreateCircuitBreaker(url: string): CircuitBreaker {
    let breaker = this.circuitBreakers.get(url);
    if (!breaker) {
      breaker = new (CircuitBreaker as any)(async (fn: () => Promise<any>) => fn(), {
        timeout: XRPL_CONSTANTS.CIRCUIT_BREAKER_TIMEOUT,
        errorThresholdPercentage: XRPL_CONSTANTS.CIRCUIT_BREAKER_THRESHOLD,
        resetTimeout: XRPL_CONSTANTS.CIRCUIT_BREAKER_RESET_TIMEOUT,
      }) as CircuitBreaker;

      breaker.on('open', () => {
        this.logger.warn(`Circuit breaker opened for ${url}`);
      });

      breaker.on('halfOpen', () => {
        this.logger.log(`Circuit breaker half-open for ${url}`);
      });

      this.circuitBreakers.set(url, breaker);
    }
    return breaker;
  }

  private handleLedgerClosed(ledger: any): void {
    const ledgerMessage: LedgerStreamMessage = {
      ledgerHash: ledger.ledger_hash,
      ledgerIndex: ledger.ledger_index,
      ledgerTime: ledger.ledger_time,
      txnCount: ledger.txn_count || 0,
      validatedLedgerIndex: ledger.validated_ledgers?.split('-')[1] || ledger.ledger_index,
    };

    // Check for gaps
    if (this.lastSeenLedger > 0 && ledgerMessage.ledgerIndex > this.lastSeenLedger + 1) {
      const gap: LedgerGap = {
        startLedger: this.lastSeenLedger + 1,
        endLedger: ledgerMessage.ledgerIndex - 1,
        size: ledgerMessage.ledgerIndex - this.lastSeenLedger - 1,
        detectedAt: new Date(),
      };
      this.ledgerGaps.push(gap);
      this.logger.warn(`Detected ledger gap: ${gap.startLedger} to ${gap.endLedger}`);
    }

    this.lastSeenLedger = ledgerMessage.ledgerIndex;

    // Notify subscribers
    this.ledgerSubscriptions.forEach((callback) => {
      try {
        callback(ledgerMessage);
      } catch (error) {
        this.logger.error(
          `Error in ledger callback: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  private handleTransaction(tx: any): void {
    const transactionMessage: TransactionStreamMessage = {
      transaction: tx.transaction || tx,
      meta: tx.meta || tx.metaData,
      engine_result: tx.engine_result || 'tesSUCCESS',
      engine_result_code: tx.engine_result_code || 0,
      engine_result_message: tx.engine_result_message || '',
      ledger_hash: tx.ledger_hash || '',
      ledger_index: tx.ledger_index || 0,
      validated: tx.validated !== false,
    };

    // Notify subscribers
    this.transactionSubscriptions.forEach((callback) => {
      try {
        callback(transactionMessage);
      } catch (error) {
        this.logger.error(
          `Error in transaction callback: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  private handleDisconnection(node: XRPLNode): void {
    this.logger.warn(`Disconnected from ${node.url}`);
    node.isHealthy = false;
    node.consecutiveFailures++;

    // Attempt reconnection
    if (node.consecutiveFailures < this.maxConsecutiveFailures) {
      setTimeout(() => {
        this.connectToNode(node).catch((error) => {
          this.logger.error(`Reconnection failed for ${node.url}: ${error.message}`);
        });
      }, this.reconnectInterval * node.consecutiveFailures);
    }
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckIntervalMs);
  }

  private async performHealthCheck(): Promise<void> {
    const promises = Array.from(this.nodes.values()).map(async (node) => {
      const client = this.connections.get(node.url);

      if (!client || !client.isConnected()) {
        node.isHealthy = false;
        if (node.consecutiveFailures < this.maxConsecutiveFailures) {
          await this.connectToNode(node).catch(() => {});
        }
        return;
      }

      try {
        const response = await client.request({
          command: 'ping',
        });

        if ((response.result as any)?.status === 'success') {
          node.isHealthy = true;
          node.consecutiveFailures = 0;
        } else {
          node.isHealthy = false;
          node.consecutiveFailures++;
        }
      } catch (error) {
        node.isHealthy = false;
        node.consecutiveFailures++;
      }

      node.lastHealthCheck = new Date();
    });

    await Promise.allSettled(promises);

    // Notify health check callbacks
    const status = this.getConnectionHealth();
    this.healthCheckCallbacks.forEach((callback) => {
      try {
        callback(status);
      } catch (error) {
        this.logger.error(
          `Error in health check callback: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }
}
