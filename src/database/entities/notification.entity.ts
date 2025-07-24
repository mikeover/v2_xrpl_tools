import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { UserEntity } from './user.entity';
import { AlertConfigEntity } from './alert-config.entity';
import { NftActivityEntity } from './nft-activity.entity';

@Entity('notifications')
@Index(['userId'])
@Index(['status'])
@Index(['scheduledAt'])
@Index(['channel'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'alert_config_id', type: 'uuid' })
  alertConfigId!: string;

  @Column({ name: 'activity_id', type: 'uuid' })
  activityId!: string;

  @Column({ type: 'varchar', length: 32 })
  channel!: string;

  @Column({
    type: 'varchar',
    length: 32,
    comment: 'pending, sent, failed',
  })
  status!: string;

  @Column({ name: 'retry_count', type: 'integer', default: 0 })
  retryCount!: number;

  @Column({ name: 'scheduled_at', type: 'timestamp' })
  scheduledAt!: Date;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt!: Date | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => UserEntity, (user) => user.notifications)
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne(() => AlertConfigEntity, (alertConfig) => alertConfig.notifications)
  @JoinColumn({ name: 'alert_config_id' })
  alertConfig!: AlertConfigEntity;

  @ManyToOne(() => NftActivityEntity, (activity) => activity.notifications)
  @JoinColumn({ name: 'activity_id' })
  activity!: NftActivityEntity;
}