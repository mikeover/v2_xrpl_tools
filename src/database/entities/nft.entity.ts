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
import { CollectionEntity } from './collection.entity';
import { NftActivityEntity } from './nft-activity.entity';

@Entity('nfts')
@Index(['nftId'], { unique: true })
@Index(['ownerAddress'])
@Index(['lastActivityAt'])
export class NftEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'nft_id', type: 'varchar', length: 64, unique: true })
  nftId!: string;

  @Column({ name: 'collection_id', type: 'uuid', nullable: true })
  collectionId!: string | null;

  @Column({ name: 'owner_address', type: 'varchar', length: 64 })
  ownerAddress!: string;

  @Column({ name: 'metadata_uri', type: 'text', nullable: true })
  metadataUri!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  traits!: Record<string, any> | null;

  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'cached_image_url', type: 'text', nullable: true })
  cachedImageUrl!: string | null;

  @Column({ name: 'last_activity_at', type: 'timestamp', nullable: true })
  lastActivityAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @ManyToOne(() => CollectionEntity, (collection) => collection.nfts)
  @JoinColumn({ name: 'collection_id' })
  collection!: CollectionEntity | null;

  @OneToMany(() => NftActivityEntity, (activity) => activity.nft)
  activities!: NftActivityEntity[];
}