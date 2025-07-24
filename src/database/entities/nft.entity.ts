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

  @Column({ name: 'metadata_uri_hex', type: 'varchar', length: 2048, nullable: true })
  metadataUriHex!: string | null;

  @Column({ name: 'metadata_uri', type: 'varchar', length: 2048, nullable: true })
  metadataUri!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, any> | null;

  @Column({ type: 'jsonb', nullable: true })
  traits!: Record<string, any> | null;

  @Column({ name: 'image_url', type: 'varchar', length: 2048, nullable: true })
  imageUrl!: string | null;

  @Column({ name: 'image_s3_url', type: 'varchar', length: 2048, nullable: true })
  imageS3Url!: string | null;

  @Column({ name: 'metadata_fetched_at', type: 'timestamp', nullable: true })
  metadataFetchedAt!: Date | null;

  @Column({ name: 'image_fetched_at', type: 'timestamp', nullable: true })
  imageFetchedAt!: Date | null;

  @Column({ name: 'metadata_fetch_error', type: 'text', nullable: true })
  metadataFetchError!: string | null;

  @Column({ name: 'image_fetch_error', type: 'text', nullable: true })
  imageFetchError!: string | null;

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