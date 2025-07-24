import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { AlertConfigRepository } from '../repositories/alert-config.repository';
import { LoggerService } from '../../../core/logger/logger.service';
import { AlertConfigEntity } from '../../../database/entities/alert-config.entity';
import {
  AlertConfigResponse,
  AlertConfigSummary,
  NotificationChannel,
  TraitFilter,
  AlertStats,
} from '../interfaces/alert.interface';
import { CreateAlertConfigDto, UpdateAlertConfigDto } from '../dto/alert.dto';

@Injectable()
export class AlertConfigService {
  constructor(
    private readonly alertConfigRepository: AlertConfigRepository,
    private readonly logger: LoggerService,
  ) {}

  async create(userId: string, createAlertDto: CreateAlertConfigDto): Promise<AlertConfigResponse> {
    try {
      // Validate price range if both min and max are provided
      if (createAlertDto.minPriceDrops && createAlertDto.maxPriceDrops) {
        const minPrice = BigInt(createAlertDto.minPriceDrops);
        const maxPrice = BigInt(createAlertDto.maxPriceDrops);
        
        if (minPrice >= maxPrice) {
          throw new BadRequestException('Minimum price must be less than maximum price');
        }
      }

      // Validate notification channels
      this.validateNotificationChannels(createAlertDto.notificationChannels);

      const createData: Parameters<typeof this.alertConfigRepository.create>[0] = {
        userId,
        name: createAlertDto.name,
        activityTypes: createAlertDto.activityTypes,
        notificationChannels: createAlertDto.notificationChannels,
      };

      if (createAlertDto.collectionId) {
        createData.collectionId = createAlertDto.collectionId;
      }
      if (createAlertDto.minPriceDrops) {
        createData.minPriceDrops = createAlertDto.minPriceDrops;
      }
      if (createAlertDto.maxPriceDrops) {
        createData.maxPriceDrops = createAlertDto.maxPriceDrops;
      }
      if (createAlertDto.traitFilters) {
        createData.traitFilters = createAlertDto.traitFilters;
      }

      const alert = await this.alertConfigRepository.create(createData);

      this.logger.log(`Alert config created: ${alert.id} by user ${userId}`);
      return this.toAlertConfigResponse(alert);
    } catch (error) {
      this.logger.error(`Failed to create alert config: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async findById(id: string, userId?: string): Promise<AlertConfigResponse> {
    const alert = await this.alertConfigRepository.findById(id);
    if (!alert) {
      throw new NotFoundException('Alert configuration not found');
    }

    // Check ownership if userId is provided
    if (userId && alert.userId !== userId) {
      throw new ForbiddenException('Access denied to this alert configuration');
    }

    return this.toAlertConfigResponse(alert);
  }

  async findByUserId(
    userId: string,
    options?: {
      isActive?: boolean;
      collectionId?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{
    alerts: AlertConfigResponse[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = options?.page || 1;
    const limit = Math.min(options?.limit || 20, 100); // Max 100 per page
    const skip = (page - 1) * limit;

    const queryOptions: Parameters<typeof this.alertConfigRepository.findByUserId>[1] = {
      skip,
      take: limit,
    };
    
    if (options?.isActive !== undefined) {
      queryOptions.isActive = options.isActive;
    }
    if (options?.collectionId) {
      queryOptions.collectionId = options.collectionId;
    }

    const [alerts, total] = await this.alertConfigRepository.findByUserId(userId, queryOptions);

    return {
      alerts: alerts.map(alert => this.toAlertConfigResponse(alert)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findSummaryByUserId(userId: string): Promise<AlertConfigSummary[]> {
    const [alerts] = await this.alertConfigRepository.findByUserId(userId);
    
    return alerts.map(alert => {
      const summary: AlertConfigSummary = {
        id: alert.id,
        name: alert.name,
        activityTypes: alert.activityTypes,
        isActive: alert.isActive,
        createdAt: alert.createdAt,
        notificationCount: alert.notifications?.length || 0,
      };

      if (alert.collection?.name) {
        summary.collectionName = alert.collection.name;
      }

      return summary;
    });
  }

  async update(
    id: string,
    userId: string,
    updateAlertDto: UpdateAlertConfigDto,
  ): Promise<AlertConfigResponse> {
    // Check if alert exists and user owns it
    const existingAlert = await this.alertConfigRepository.findById(id);
    if (!existingAlert) {
      throw new NotFoundException('Alert configuration not found');
    }

    if (existingAlert.userId !== userId) {
      throw new ForbiddenException('Access denied to this alert configuration');
    }

    // Validate price range if both min and max are provided
    if (updateAlertDto.minPriceDrops && updateAlertDto.maxPriceDrops) {
      const minPrice = BigInt(updateAlertDto.minPriceDrops);
      const maxPrice = BigInt(updateAlertDto.maxPriceDrops);
      
      if (minPrice >= maxPrice) {
        throw new BadRequestException('Minimum price must be less than maximum price');
      }
    }

    // Validate notification channels if provided
    if (updateAlertDto.notificationChannels) {
      this.validateNotificationChannels(updateAlertDto.notificationChannels);
    }

    const updatedAlert = await this.alertConfigRepository.update(id, updateAlertDto);
    if (!updatedAlert) {
      throw new Error('Failed to update alert configuration');
    }

    this.logger.log(`Alert config updated: ${id} by user ${userId}`);
    return this.toAlertConfigResponse(updatedAlert);
  }

  async delete(id: string, userId: string): Promise<void> {
    // Check if alert exists and user owns it
    const existingAlert = await this.alertConfigRepository.findById(id);
    if (!existingAlert) {
      throw new NotFoundException('Alert configuration not found');
    }

    if (existingAlert.userId !== userId) {
      throw new ForbiddenException('Access denied to this alert configuration');
    }

    const deleted = await this.alertConfigRepository.delete(id);
    if (!deleted) {
      throw new Error('Failed to delete alert configuration');
    }

    this.logger.log(`Alert config deleted: ${id} by user ${userId}`);
  }

  async toggleActive(id: string, userId: string): Promise<AlertConfigResponse> {
    const alert = await this.alertConfigRepository.findById(id);
    if (!alert) {
      throw new NotFoundException('Alert configuration not found');
    }

    if (alert.userId !== userId) {
      throw new ForbiddenException('Access denied to this alert configuration');
    }

    const updatedAlert = await this.alertConfigRepository.update(id, {
      isActive: !alert.isActive,
    });

    if (!updatedAlert) {
      throw new Error('Failed to toggle alert configuration');
    }

    this.logger.log(`Alert config toggled: ${id} (${updatedAlert.isActive ? 'activated' : 'deactivated'}) by user ${userId}`);
    return this.toAlertConfigResponse(updatedAlert);
  }

  async getAlertStats(userId: string): Promise<AlertStats> {
    const baseStats = await this.alertConfigRepository.getAlertStats(userId);
    
    // Get alerts to analyze activity types
    const [alerts] = await this.alertConfigRepository.findByUserId(userId);
    const alertsByActivityType: Record<string, number> = {};
    
    alerts.forEach(alert => {
      alert.activityTypes.forEach(activityType => {
        alertsByActivityType[activityType] = (alertsByActivityType[activityType] || 0) + 1;
      });
    });

    // TODO: Get total notifications sent from notifications table
    // For now, set to 0 as we haven't implemented notifications yet
    const totalNotificationsSent = 0;

    return {
      ...baseStats,
      totalNotificationsSent,
      alertsByActivityType,
    };
  }

  async findActiveAlertsForActivity(activityType: string, collectionId?: string): Promise<AlertConfigEntity[]> {
    return this.alertConfigRepository.findAlertsMatchingActivity(activityType, collectionId);
  }

  private validateNotificationChannels(channels: NotificationChannel[]): void {
    if (channels.length === 0) {
      throw new BadRequestException('At least one notification channel must be enabled');
    }

    const enabledChannels = channels.filter(channel => channel.enabled);
    if (enabledChannels.length === 0) {
      throw new BadRequestException('At least one notification channel must be enabled');
    }

    // Validate channel configurations
    enabledChannels.forEach(channel => {
      switch (channel.type) {
        case 'discord':
          if (!channel.config?.discordWebhookUrl) {
            throw new BadRequestException('Discord webhook URL is required for Discord notifications');
          }
          break;
        case 'email':
          if (!channel.config?.email) {
            throw new BadRequestException('Email address is required for email notifications');
          }
          break;
        case 'webhook':
          if (!channel.config?.webhookUrl) {
            throw new BadRequestException('Webhook URL is required for webhook notifications');
          }
          break;
      }
    });
  }

  private toAlertConfigResponse(entity: AlertConfigEntity): AlertConfigResponse {
    const response: AlertConfigResponse = {
      id: entity.id,
      userId: entity.userId,
      name: entity.name,
      activityTypes: entity.activityTypes,
      traitFilters: entity.traitFilters as TraitFilter[],
      notificationChannels: entity.notificationChannels as NotificationChannel[],
      isActive: entity.isActive,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };

    if (entity.collectionId) {
      response.collectionId = entity.collectionId;
    }
    if (entity.minPriceDrops) {
      response.minPriceDrops = entity.minPriceDrops;
    }
    if (entity.maxPriceDrops) {
      response.maxPriceDrops = entity.maxPriceDrops;
    }
    if (entity.collection) {
      response.collection = {
        id: entity.collection.id,
        issuerAddress: entity.collection.issuerAddress,
        taxon: entity.collection.taxon,
      };
      
      if (entity.collection.name) {
        response.collection.name = entity.collection.name;
      }
    }

    return response;
  }
}