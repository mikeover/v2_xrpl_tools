import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('ledger_sync_status')
@Index(['ledgerIndex'], { unique: true })
@Index(['closeTime'])
export class LedgerSyncStatusEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ledger_index', type: 'bigint', unique: true })
  ledgerIndex!: string;

  @Column({ name: 'ledger_hash', type: 'varchar', length: 64 })
  ledgerHash!: string;

  @Column({ name: 'close_time', type: 'timestamp' })
  closeTime!: Date;

  @Column({ name: 'transaction_count', type: 'integer' })
  transactionCount!: number;

  @Column({ name: 'processed_at', type: 'timestamp' })
  processedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}