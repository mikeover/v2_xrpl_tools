import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertMatchingService, NFTActivity } from './alert-matching.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { NftActivityEntity } from '../../../database/entities/nft-activity.entity';
import { AlertConfigEntity } from '../../../database/entities/alert-config.entity';
import { NotificationProcessorService } from '../../notifications/services/notification-processor.service';
import { AlertMatchResult } from '../interfaces/alert.interface';
import { NotificationChannel } from '../../notifications/interfaces/notification.interface';

@Injectable()
export class AlertNotificationService {
  constructor(
    private readonly alertMatchingService: AlertMatchingService,
    private readonly logger: LoggerService,
    private readonly notificationProcessor: NotificationProcessorService,
    @InjectRepository(AlertConfigEntity)
    private readonly alertConfigRepository: Repository<AlertConfigEntity>,
  ) {}

  /**
   * Process a batch of NFT activities and generate notifications for matching alerts
   */
  async processActivityBatch(activities: NftActivityEntity[]): Promise<void> {
    try {
      this.logger.debug(`Processing ${activities.length} NFT activities for alert matching`);

      const processedActivities = await Promise.allSettled(
        activities.map(activity => this.processActivity(activity))
      );

      const successful = processedActivities.filter(result => result.status === 'fulfilled').length;
      const failed = processedActivities.length - successful;

      this.logger.log(
        `Alert processing completed: ${successful} successful, ${failed} failed out of ${activities.length} activities`
      );

      if (failed > 0) {
        const errors = processedActivities
          .filter(result => result.status === 'rejected')
          .map(result => (result as PromiseRejectedResult).reason);
        
        this.logger.warn(`Failed to process some activities: ${errors.join(', ')}`);
      }
    } catch (error) {
      this.logger.error(
        `Critical error in processActivityBatch: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Process a single NFT activity and generate notifications for matching alerts
   */
  async processActivity(activity: NftActivityEntity): Promise<void> {
    try {
      // Convert database entity to the format expected by AlertMatchingService
      const nftActivity = await this.convertToNFTActivity(activity);
      
      // Find matching alerts
      const matchResults = await this.alertMatchingService.findMatchingAlerts(nftActivity);
      
      // Filter for successful matches
      const successfulMatches = matchResults.filter(result => result.matched);
      
      if (successfulMatches.length > 0) {
        this.logger.debug(
          `Found ${successfulMatches.length} matching alerts for activity ${activity.id}`
        );

        // Generate notifications for each match
        await Promise.allSettled(
          successfulMatches.map(match => this.generateNotification(activity, match))
        );
      } else {
        this.logger.debug(`No matching alerts found for activity ${activity.id}`);
      }
    } catch (error) {
      this.logger.error(
        `Error processing activity ${activity.id}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Convert NftActivityEntity to NFTActivity format expected by AlertMatchingService
   */
  private async convertToNFTActivity(activity: NftActivityEntity): Promise<NFTActivity> {
    const nftActivity: NFTActivity = {
      id: activity.id,
      nftId: activity.nftId || '',
      transactionHash: activity.transactionHash,
      ledgerIndex: parseInt(activity.ledgerIndex),
      activityType: activity.activityType,
      timestamp: activity.timestamp,
    };

    // Add optional properties only if they exist
    if (activity.fromAddress) {
      nftActivity.fromAddress = activity.fromAddress;
    }
    if (activity.toAddress) {
      nftActivity.toAddress = activity.toAddress;
    }
    if (activity.priceDrops) {
      nftActivity.priceDrops = activity.priceDrops;
    }
    if (activity.currency) {
      nftActivity.currency = activity.currency;
    }
    if (activity.issuer) {
      nftActivity.issuer = activity.issuer;
    }

    // Include NFT data if available
    if (activity.nft) {
      nftActivity.nft = {
        id: activity.nft.id,
        nftId: activity.nft.nftId,
        ownerAddress: activity.nft.ownerAddress,
        metadata: activity.nft.metadata,
        traits: activity.nft.traits,
      };

      // Add optional NFT properties
      if (activity.nft.collectionId) {
        nftActivity.nft.collectionId = activity.nft.collectionId;
      }
      if (activity.nft.imageUrl) {
        nftActivity.nft.imageUrl = activity.nft.imageUrl;
      }

      // Include collection data if available
      if (activity.nft.collection) {
        nftActivity.nft.collection = {
          id: activity.nft.collection.id,
          issuerAddress: activity.nft.collection.issuerAddress,
          taxon: activity.nft.collection.taxon,
        };

        if (activity.nft.collection.name) {
          nftActivity.nft.collection.name = activity.nft.collection.name;
        }
      }
    }

    return nftActivity;
  }

  /**
   * Generate notifications for a matched alert
   */
  private async generateNotification(
    activity: NftActivityEntity,
    matchResult: AlertMatchResult
  ): Promise<void> {
    try {
      this.logger.log(
        `🚨 ALERT MATCHED: Activity ${activity.id} (${activity.activityType}) matched alert ${matchResult.alertConfigId}. ` +
        `Transaction: ${activity.transactionHash}. ` +
        `Reasons: ${matchResult.reasons?.join(', ') || 'No reasons provided'}`
      );

      // Get the alert configuration with notification channels
      const alertConfig = await this.alertConfigRepository.findOne({
        where: { id: matchResult.alertConfigId },
        select: ['id', 'userId', 'notificationChannels'],
      });

      if (!alertConfig) {
        this.logger.error(`Alert configuration ${matchResult.alertConfigId} not found`);
        return;
      }

      if (!alertConfig.notificationChannels || alertConfig.notificationChannels['length'] === 0) {
        this.logger.debug(`No notification channels configured for alert ${matchResult.alertConfigId}`);
        return;
      }

      // Process notifications through the notification processor
      await this.notificationProcessor.processActivityNotifications(
        alertConfig.userId,
        matchResult.alertConfigId,
        activity.id,
        alertConfig.notificationChannels as NotificationChannel[]
      );

      this.logger.log(
        `✅ Queued notifications for alert ${matchResult.alertConfigId} via ${alertConfig.notificationChannels['length']} channels`
      );

    } catch (error) {
      this.logger.error(
        `Failed to generate notification for activity ${activity.id} and alert ${matchResult.alertConfigId}: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Convert NftActivityEntity to notification data format
   * Currently unused but kept for future use
   */
  /*
  private async convertToNotificationData(activity: NftActivityEntity): Promise<NFTActivityNotificationData> {
    const notificationData: NFTActivityNotificationData = {
      activityType: activity.activityType,
      transactionHash: activity.transactionHash,
      ledgerIndex: parseInt(activity.ledgerIndex),
      timestamp: activity.timestamp,
    };

    // Add optional properties
    if (activity.fromAddress) {
      notificationData.fromAddress = activity.fromAddress;
    }
    if (activity.toAddress) {
      notificationData.toAddress = activity.toAddress;
    }
    if (activity.priceDrops) {
      notificationData.priceDrops = activity.priceDrops;
    }
    if (activity.currency) {
      notificationData.currency = activity.currency;
    }
    if (activity.issuer) {
      notificationData.issuer = activity.issuer;
    }

    // Include NFT data if available
    if (activity.nft) {
      notificationData.nft = {
        id: activity.nft.id,
        nftId: activity.nft.nftId,
        ownerAddress: activity.nft.ownerAddress,
        metadata: activity.nft.metadata,
      };

      // Add optional NFT properties
      if (activity.nft.imageUrl) {
        notificationData.nft.imageUrl = activity.nft.imageUrl;
      }

      // Include collection data if available
      if (activity.nft.collection) {
        notificationData.nft.collection = {
          id: activity.nft.collection.id,
          issuerAddress: activity.nft.collection.issuerAddress,
          taxon: activity.nft.collection.taxon,
        };

        if (activity.nft.collection.name) {
          notificationData.nft.collection.name = activity.nft.collection.name;
        }
      }
    }

    return notificationData;
  }
  */

  /**
   * Get statistics about alert processing
   */
  async getProcessingStats(): Promise<{
    totalActivitiesProcessed: number;
    totalNotificationsGenerated: number;
    totalAlertMatches: number;
    averageProcessingTimeMs: number;
  }> {
    // TODO: Implement actual statistics tracking
    // This would require storing processing metrics in the database
    return {
      totalActivitiesProcessed: 0,
      totalNotificationsGenerated: 0,
      totalAlertMatches: 0,
      averageProcessingTimeMs: 0,
    };
  }

  /**
   * Health check for the alert notification system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Check if we can access the alert matching service
      await this.alertMatchingService.findMatchingAlerts({
        id: 'health-check',
        nftId: 'test',
        transactionHash: 'test',
        ledgerIndex: 0,
        activityType: 'mint',
        timestamp: new Date(),
      });
    } catch (error) {
      issues.push(`Alert matching service error: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
      // Check database connectivity
      await this.alertConfigRepository.count();
    } catch (error) {
      issues.push(`Database connectivity error: ${error instanceof Error ? error.message : String(error)}`);
    }

    const status = issues.length === 0 ? 'healthy' : issues.length < 2 ? 'degraded' : 'unhealthy';

    return { status, issues };
  }
}