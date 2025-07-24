import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { NftEntity } from './nft.entity';
import { AlertConfigEntity } from './alert-config.entity';

@Entity('collections')
@Index(['issuerAddress', 'taxon'], { unique: true })
export class CollectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'issuer_address', type: 'varchar', length: 64 })
  issuerAddress!: string;

  @Column({ type: 'integer' })
  taxon!: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => NftEntity, (nft) => nft.collection)
  nfts!: NftEntity[];

  @OneToMany(() => AlertConfigEntity, (alertConfig) => alertConfig.collection)
  alertConfigs!: AlertConfigEntity[];
}