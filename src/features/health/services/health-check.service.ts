import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggerService } from '../../../core/logger/logger.service';
import { XRPLConnectionManagerService } from '../../../modules/xrpl-connection/services/xrpl-connection-manager.service';
import { QueueHealthService } from '../../../modules/queue/services/queue-health.service';
import { AlertNotificationService } from '../../alerts/services/alert-notification.service';
import { NotificationProcessorService } from '../../notifications/services/notification-processor.service';
import { UserEntity } from '../../../database/entities/user.entity';
import { NftActivityEntity } from '../../../database/entities/nft-activity.entity';
import { NotificationEntity } from '../../../database/entities/notification.entity';
import {
  HealthStatus,
  HealthCheckResult,
  ComponentHealth,
  SystemHealth,
  EndToEndHealthCheck,
  HealthMetrics,
} from '../interfaces/health.interface';

@Injectable()
export class HealthCheckService {
  private startTime: Date;
  private lastEndToEndTest?: Date;
  private endToEndFailureCount = 0;

  constructor(
    private readonly logger: LoggerService,
    private readonly xrplConnectionManager: XRPLConnectionManagerService,
    private readonly queueHealthService: QueueHealthService,
    private readonly alertNotificationService: AlertNotificationService,
    private readonly notificationProcessorService: NotificationProcessorService,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(NftActivityEntity)
    private readonly nftActivityRepository: Repository<NftActivityEntity>,
    @InjectRepository(NotificationEntity)
    private readonly notificationRepository: Repository<NotificationEntity>,
  ) {
    this.startTime = new Date();
  }

  /**
   * Get comprehensive system health status
   */
  async getSystemHealth(): Promise<SystemHealth> {
    const [
      databaseHealth,
      xrplHealth,
      queueHealth,
      metadataHealth,
      alertHealth,
      notificationHealth,
    ] = await Promise.allSettled([
      this.checkDatabaseHealth(),
      this.checkXRPLConnectionHealth(),
      this.checkMessageQueueHealth(),
      this.checkMetadataEnrichmentHealth(),
      this.checkAlertProcessingHealth(),
      this.checkNotificationHealth(),
    ]);

    const components: SystemHealth['components'] = {
      database: this.resolveHealthResult(databaseHealth, 'Database'),
      xrplConnection: this.resolveHealthResult(xrplHealth, 'XRPL Connection'),
      messageQueue: this.resolveHealthResult(queueHealth, 'Message Queue'),
      metadataEnrichment: this.resolveHealthResult(metadataHealth, 'Metadata Enrichment'),
      alertProcessing: this.resolveHealthResult(alertHealth, 'Alert Processing'),
      notifications: this.resolveHealthResult(notificationHealth, 'Notifications'),
    };

    // Determine overall system status
    const componentStatuses = Object.values(components).map(c => c.status);
    const unhealthyCount = componentStatuses.filter(s => s === 'unhealthy').length;
    const degradedCount = componentStatuses.filter(s => s === 'degraded').length;

    let overallStatus: HealthStatus = 'healthy';
    if (unhealthyCount > 0) {
      overallStatus = 'unhealthy';
    } else if (degradedCount > 0) {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      version: process.env['npm_package_version'] || '1.0.0',
      uptime: Date.now() - this.startTime.getTime(),
      timestamp: new Date(),
      components,
      checks: {},
    };
  }

  /**
   * Perform end-to-end health check
   */
  async performEndToEndHealthCheck(): Promise<EndToEndHealthCheck> {
    const startTime = Date.now();
    let lastSuccessAt: Date | undefined;
    const details: EndToEndHealthCheck['details'] = {};

    try {
      this.lastEndToEndTest = new Date();
      
      // Step 1: Verify we can query the database
      const userCount = await this.userRepository.count();
      if (userCount === 0) {
        throw new Error('No users found in system');
      }

      // Step 2: Check XRPL connection
      const xrplHealth = this.xrplConnectionManager.getConnectionHealth();
      if (xrplHealth.healthyNodes === 0) {
        throw new Error('XRPL not connected');
      }

      // Step 3: Check if transactions are being processed
      const recentActivity = await this.nftActivityRepository
        .createQueryBuilder('activity')
        .where('activity.created_at > :date', { 
          date: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
        })
        .getCount();
      
      details.transactionProcessed = recentActivity > 0;

      // Step 4: Check if alerts are being matched
      // This would require checking logs or adding metrics
      details.alertMatched = true; // Placeholder

      // Step 5: Check if notifications are being sent
      const recentNotifications = await this.notificationRepository
        .createQueryBuilder('notification')
        .where('notification.created_at > :date', { 
          date: new Date(Date.now() - 5 * 60 * 1000) // Last 5 minutes
        })
        .andWhere('notification.status = :status', { status: 'sent' })
        .getCount();
      
      details.notificationSent = recentNotifications > 0;

      details.totalTimeMs = Date.now() - startTime;
      lastSuccessAt = new Date();
      this.endToEndFailureCount = 0;

      return {
        status: 'healthy',
        lastTestAt: this.lastEndToEndTest,
        lastSuccessAt,
        failureCount: this.endToEndFailureCount,
        details,
      };

    } catch (error) {
      this.endToEndFailureCount++;
      details.error = error instanceof Error ? error.message : String(error);
      details.totalTimeMs = Date.now() - startTime;

      this.logger.error(`End-to-end health check failed: ${details.error}`);

      return {
        status: 'unhealthy' as HealthStatus,
        lastTestAt: this.lastEndToEndTest,
        lastSuccessAt,
        failureCount: this.endToEndFailureCount,
        details,
      };
    }
  }

  /**
   * Get system metrics
   */
  async getHealthMetrics(): Promise<HealthMetrics> {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

    // Transaction metrics
    const [totalTransactions, recentTransactions] = await Promise.all([
      this.nftActivityRepository.count(),
      this.nftActivityRepository
        .createQueryBuilder('activity')
        .where('activity.created_at > :date', { date: oneMinuteAgo })
        .getCount(),
    ]);

    // Alert metrics
    const alertStats = await this.getAlertStats();

    // Notification metrics
    const notificationStats = await this.notificationProcessorService.getNotificationStats();

    // Metadata metrics
    const metadataStats = await this.getMetadataStats();

    return {
      transactions: {
        processed: totalTransactions,
        failed: 0, // Would need to track this
        rate: recentTransactions,
      },
      alerts: alertStats,
      notifications: {
        sent: notificationStats.sent,
        failed: notificationStats.failed,
        pending: notificationStats.pending,
      },
      metadata: metadataStats,
    };
  }

  /**
   * Check database health
   */
  private async checkDatabaseHealth(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      await this.userRepository.query('SELECT 1');
      return {
        status: 'healthy',
        timestamp: new Date(),
        latencyMs: Date.now() - start,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Database connection failed',
        latencyMs: Date.now() - start,
      };
    }
  }

  /**
   * Check XRPL connection health
   */
  private async checkXRPLConnectionHealth(): Promise<HealthCheckResult> {
    try {
      const health = this.xrplConnectionManager.getConnectionHealth();
      
      if (health.healthyNodes === 0) {
        return {
          status: 'unhealthy',
          timestamp: new Date(),
          error: 'Not connected to XRPL',
        };
      }

      if (health.unhealthyNodes > 0) {
        return {
          status: 'degraded',
          timestamp: new Date(),
          details: `${health.unhealthyNodes} XRPL connections are unhealthy`,
        };
      }

      return {
        status: 'healthy',
        timestamp: new Date(),
        details: `${health.healthyNodes} healthy connections`,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'XRPL check failed',
      };
    }
  }

  /**
   * Check message queue health
   */
  private async checkMessageQueueHealth(): Promise<HealthCheckResult> {
    try {
      const health = await this.queueHealthService.getHealth();
      
      return {
        status: health.status as HealthStatus,
        timestamp: new Date(),
        details: health.message,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Queue check failed',
      };
    }
  }

  /**
   * Check metadata enrichment health
   */
  private async checkMetadataEnrichmentHealth(): Promise<HealthCheckResult> {
    try {
      // Check if there are stuck items in the queue
      const stuckItems = await this.getStuckMetadataItems();
      
      if (stuckItems > 10) {
        return {
          status: 'degraded',
          timestamp: new Date(),
          details: `${stuckItems} items stuck in metadata queue`,
        };
      }

      return {
        status: 'healthy',
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Metadata check failed',
      };
    }
  }

  /**
   * Check alert processing health
   */
  private async checkAlertProcessingHealth(): Promise<HealthCheckResult> {
    try {
      const health = await this.alertNotificationService.healthCheck();
      
      const result: HealthCheckResult = {
        status: health.status,
        timestamp: new Date(),
      };
      
      if (health.issues.length > 0) {
        result.details = health.issues.join(', ');
      }
      
      return result;
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Alert check failed',
      };
    }
  }

  /**
   * Check notification health
   */
  private async checkNotificationHealth(): Promise<HealthCheckResult> {
    try {
      const health = await this.notificationProcessorService.healthCheck();
      
      const result: HealthCheckResult = {
        status: health.status,
        timestamp: new Date(),
      };
      
      if (health.issues.length > 0) {
        result.details = health.issues.join(', ');
      }
      
      return result;
    } catch (error) {
      return {
        status: 'unhealthy',
        timestamp: new Date(),
        error: error instanceof Error ? error.message : 'Notification check failed',
      };
    }
  }

  /**
   * Resolve health check promise result
   */
  private resolveHealthResult(
    result: PromiseSettledResult<HealthCheckResult>,
    componentName: string
  ): ComponentHealth {
    if (result.status === 'fulfilled') {
      return {
        name: componentName,
        status: result.value.status,
        details: result.value,
      };
    } else {
      return {
        name: componentName,
        status: 'unhealthy',
        details: {
          status: 'unhealthy',
          timestamp: new Date(),
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        },
      };
    }
  }

  /**
   * Get alert statistics
   */
  private async getAlertStats(): Promise<HealthMetrics['alerts']> {
    // This would need to be implemented in AlertConfigService
    return {
      total: 0,
      active: 0,
      matched: 0,
    };
  }

  /**
   * Get metadata statistics
   */
  private async getMetadataStats(): Promise<HealthMetrics['metadata']> {
    // This would need to be implemented based on metadata_enrichment_queue
    return {
      enriched: 0,
      failed: 0,
      queued: 0,
    };
  }

  /**
   * Get stuck metadata items count
   */
  private async getStuckMetadataItems(): Promise<number> {
    // Items that have been retrying for more than 1 hour
    // This would need the metadata enrichment queue entity
    return 0; // Placeholder
  }
}