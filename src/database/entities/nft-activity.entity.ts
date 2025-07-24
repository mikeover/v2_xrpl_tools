import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { NftEntity } from './nft.entity';
import { NotificationEntity } from './notification.entity';

@Entity('nft_activities')
@Index(['transactionHash'])
@Index(['ledgerIndex'])
@Index(['activityType'])
@Index(['timestamp'])
@Index(['fromAddress'])
@Index(['toAddress'])
export class NftActivityEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'nft_id', type: 'uuid', nullable: true })
  nftId!: string | null;

  @Column({ name: 'transaction_hash', type: 'varchar', length: 64 })
  transactionHash!: string;

  @Column({ name: 'ledger_index', type: 'bigint' })
  ledgerIndex!: string;

  @Column({
    name: 'activity_type',
    type: 'varchar',
    length: 32,
    comment: 'mint, sale, offer_created, offer_accepted, etc.',
  })
  activityType!: string;

  @Column({ name: 'from_address', type: 'varchar', length: 64, nullable: true })
  fromAddress!: string | null;

  @Column({ name: 'to_address', type: 'varchar', length: 64, nullable: true })
  toAddress!: string | null;

  @Column({ name: 'price_drops', type: 'bigint', nullable: true })
  priceDrops!: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  currency!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  issuer!: string | null;

  @Column({ type: 'timestamp' })
  timestamp!: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => NftEntity, (nft) => nft.activities)
  @JoinColumn({ name: 'nft_id' })
  nft!: NftEntity | null;

  @OneToMany(() => NotificationEntity, (notification) => notification.activity)
  notifications!: NotificationEntity[];
}