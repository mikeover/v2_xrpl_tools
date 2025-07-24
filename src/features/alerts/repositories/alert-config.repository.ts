import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AlertConfigEntity } from '../../../database/entities/alert-config.entity';
import { NotificationChannel, TraitFilter } from '../interfaces/alert.interface';

@Injectable()
export class AlertConfigRepository {
  constructor(
    @InjectRepository(AlertConfigEntity)
    private readonly repository: Repository<AlertConfigEntity>,
  ) {}

  async findById(id: string): Promise<AlertConfigEntity | null> {
    return this.repository.findOne({
      where: { id },
      relations: ['collection'],
    });
  }

  async findByUserId(
    userId: string,
    options?: {
      isActive?: boolean;
      collectionId?: string;
      skip?: number;
      take?: number;
    },
  ): Promise<[AlertConfigEntity[], number]> {
    const query = this.repository.createQueryBuilder('alert')
      .leftJoinAndSelect('alert.collection', 'collection')
      .where('alert.userId = :userId', { userId });

    if (options?.isActive !== undefined) {
      query.andWhere('alert.isActive = :isActive', { isActive: options.isActive });
    }

    if (options?.collectionId) {
      query.andWhere('alert.collectionId = :collectionId', { collectionId: options.collectionId });
    }

    if (options?.skip) {
      query.skip(options.skip);
    }

    if (options?.take) {
      query.take(options.take);
    }

    query.orderBy('alert.createdAt', 'DESC');

    return query.getManyAndCount();
  }

  async findActiveAlerts(): Promise<AlertConfigEntity[]> {
    return this.repository.find({
      where: { isActive: true },
      relations: ['collection'],
    });
  }

  async findByCollectionId(collectionId: string): Promise<AlertConfigEntity[]> {
    return this.repository.find({
      where: { collectionId, isActive: true },
      relations: ['collection'],
    });
  }

  async create(alertData: {
    userId: string;
    name: string;
    collectionId?: string;
    activityTypes: string[];
    minPriceDrops?: string;
    maxPriceDrops?: string;
    traitFilters?: TraitFilter[];
    notificationChannels: NotificationChannel[];
  }): Promise<AlertConfigEntity> {
    const alert = this.repository.create({
      userId: alertData.userId,
      name: alertData.name,
      collectionId: alertData.collectionId || null,
      activityTypes: alertData.activityTypes,
      minPriceDrops: alertData.minPriceDrops || null,
      maxPriceDrops: alertData.maxPriceDrops || null,
      traitFilters: alertData.traitFilters || null,
      notificationChannels: alertData.notificationChannels,
    });

    return this.repository.save(alert);
  }

  async update(
    id: string,
    updates: {
      name?: string;
      collectionId?: string;
      activityTypes?: string[];
      minPriceDrops?: string;
      maxPriceDrops?: string;
      traitFilters?: TraitFilter[];
      notificationChannels?: NotificationChannel[];
      isActive?: boolean;
    },
  ): Promise<AlertConfigEntity | null> {
    const updateData: Partial<AlertConfigEntity> = {};

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.collectionId !== undefined) updateData.collectionId = updates.collectionId || null;
    if (updates.activityTypes !== undefined) updateData.activityTypes = updates.activityTypes;
    if (updates.minPriceDrops !== undefined) updateData.minPriceDrops = updates.minPriceDrops || null;
    if (updates.maxPriceDrops !== undefined) updateData.maxPriceDrops = updates.maxPriceDrops || null;
    if (updates.traitFilters !== undefined) updateData.traitFilters = updates.traitFilters || null;
    if (updates.notificationChannels !== undefined) updateData.notificationChannels = updates.notificationChannels;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;

    await this.repository.update(id, updateData);
    return this.findById(id);
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);
    return (result.affected ?? 0) > 0;
  }

  async countByUserId(userId: string): Promise<number> {
    return this.repository.count({ where: { userId } });
  }

  async getAlertStats(userId: string): Promise<{
    totalAlerts: number;
    activeAlerts: number;
    inactiveAlerts: number;
  }> {
    const [totalAlerts, activeAlerts] = await Promise.all([
      this.repository.count({ where: { userId } }),
      this.repository.count({ where: { userId, isActive: true } }),
    ]);

    return {
      totalAlerts,
      activeAlerts,
      inactiveAlerts: totalAlerts - activeAlerts,
    };
  }

  async findAlertsMatchingActivity(activityType: string, collectionId?: string): Promise<AlertConfigEntity[]> {
    const query = this.repository.createQueryBuilder('alert')
      .leftJoinAndSelect('alert.collection', 'collection')
      .where('alert.isActive = :isActive', { isActive: true })
      .andWhere(':activityType = ANY(alert.activityTypes)', { activityType });

    if (collectionId) {
      query.andWhere('(alert.collectionId IS NULL OR alert.collectionId = :collectionId)', { collectionId });
    } else {
      query.andWhere('alert.collectionId IS NULL');
    }

    return query.getMany();
  }

  async exists(id: string, userId?: string): Promise<boolean> {
    const whereCondition: any = { id };
    if (userId) {
      whereCondition.userId = userId;
    }

    const count = await this.repository.count({ where: whereCondition });
    return count > 0;
  }
}