import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { CollectionEntity } from './collection.entity';
import { NotificationEntity } from './notification.entity';

@Entity('alert_configs')
@Index(['userId'])
@Index(['collectionId'])
@Index(['isActive'])
export class AlertConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'collection_id', type: 'uuid', nullable: true })
  collectionId!: string | null;

  @Column({ name: 'activity_types', type: 'text', array: true })
  activityTypes!: string[];

  @Column({ name: 'min_price_drops', type: 'bigint', nullable: true })
  minPriceDrops!: string | null;

  @Column({ name: 'max_price_drops', type: 'bigint', nullable: true })
  maxPriceDrops!: string | null;

  @Column({ name: 'trait_filters', type: 'jsonb', nullable: true })
  traitFilters!: Record<string, any> | null;

  @Column({ name: 'notification_channels', type: 'jsonb' })
  notificationChannels!: Record<string, any>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => UserEntity, (user) => user.alertConfigs)
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => CollectionEntity, (collection) => collection.alertConfigs)
  @JoinColumn({ name: 'collection_id' })
  collection!: CollectionEntity | null;

  @OneToMany(() => NotificationEntity, (notification) => notification.alertConfig)
  notifications!: NotificationEntity[];
}