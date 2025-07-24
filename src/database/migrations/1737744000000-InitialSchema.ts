import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1737744000000 implements MigrationInterface {
  name = 'InitialSchema1737744000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create extension for UUID generation
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" character varying(255) NOT NULL,
        "password_hash" character varying(255) NOT NULL,
        "first_name" character varying(100),
        "last_name" character varying(100),
        "is_active" boolean NOT NULL DEFAULT true,
        "email_verified" boolean NOT NULL DEFAULT false,
        "last_login_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email")
      )
    `);

    // Create collections table
    await queryRunner.query(`
      CREATE TABLE "collections" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "issuer_address" character varying(64) NOT NULL,
        "taxon" integer NOT NULL,
        "name" character varying(255),
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_collections_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_collections_issuer_taxon" UNIQUE ("issuer_address", "taxon")
      )
    `);

    // Create nfts table
    await queryRunner.query(`
      CREATE TABLE "nfts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "nft_id" character varying(64) NOT NULL,
        "collection_id" uuid,
        "owner_address" character varying(64) NOT NULL,
        "metadata_uri" text,
        "metadata" jsonb,
        "traits" jsonb,
        "image_url" text,
        "cached_image_url" text,
        "last_activity_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_nfts_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_nfts_nft_id" UNIQUE ("nft_id"),
        CONSTRAINT "FK_nfts_collection_id" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    // Create nft_activities table (will be converted to hypertable)
    await queryRunner.query(`
      CREATE TABLE "nft_activities" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "nft_id" uuid,
        "transaction_hash" character varying(64) NOT NULL,
        "ledger_index" bigint NOT NULL,
        "activity_type" character varying(32) NOT NULL,
        "from_address" character varying(64),
        "to_address" character varying(64),
        "price_drops" bigint,
        "currency" character varying(40),
        "issuer" character varying(64),
        "timestamp" TIMESTAMP NOT NULL,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_nft_activities_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_nft_activities_nft_id" FOREIGN KEY ("nft_id") REFERENCES "nfts"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    // Create alert_configs table
    await queryRunner.query(`
      CREATE TABLE "alert_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "collection_id" uuid,
        "activity_types" text array NOT NULL,
        "min_price_drops" bigint,
        "max_price_drops" bigint,
        "trait_filters" jsonb,
        "notification_channels" jsonb NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_alert_configs_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_alert_configs_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_alert_configs_collection_id" FOREIGN KEY ("collection_id") REFERENCES "collections"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);

    // Create notifications table
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "alert_config_id" uuid NOT NULL,
        "activity_id" uuid NOT NULL,
        "channel" character varying(32) NOT NULL,
        "status" character varying(32) NOT NULL,
        "retry_count" integer NOT NULL DEFAULT 0,
        "scheduled_at" TIMESTAMP NOT NULL,
        "sent_at" TIMESTAMP,
        "error_message" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_notifications_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_notifications_alert_config_id" FOREIGN KEY ("alert_config_id") REFERENCES "alert_configs"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_notifications_activity_id" FOREIGN KEY ("activity_id") REFERENCES "nft_activities"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // Create ledger_sync_status table
    await queryRunner.query(`
      CREATE TABLE "ledger_sync_status" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ledger_index" bigint NOT NULL,
        "ledger_hash" character varying(64) NOT NULL,
        "close_time" TIMESTAMP NOT NULL,
        "transaction_count" integer NOT NULL,
        "processed_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ledger_sync_status_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_ledger_sync_status_ledger_index" UNIQUE ("ledger_index")
      )
    `);

    // Create indexes for performance
    
    // Collections indexes
    await queryRunner.query('CREATE INDEX "IDX_collections_issuer_address" ON "collections" ("issuer_address")');
    
    // NFTs indexes
    await queryRunner.query('CREATE INDEX "IDX_nfts_owner_address" ON "nfts" ("owner_address")');
    await queryRunner.query('CREATE INDEX "IDX_nfts_last_activity_at" ON "nfts" ("last_activity_at")');
    await queryRunner.query('CREATE INDEX "IDX_nfts_collection_id" ON "nfts" ("collection_id")');
    
    // NFT Activities indexes (critical for performance)
    await queryRunner.query('CREATE INDEX "IDX_nft_activities_transaction_hash" ON "nft_activities" ("transaction_hash")');
    await queryRunner.query('CREATE INDEX "IDX_nft_activities_ledger_index" ON "nft_activities" ("ledger_index")');
    await queryRunner.query('CREATE INDEX "IDX_nft_activities_activity_type" ON "nft_activities" ("activity_type")');
    await queryRunner.query('CREATE INDEX "IDX_nft_activities_timestamp" ON "nft_activities" ("timestamp")');
    await queryRunner.query('CREATE INDEX "IDX_nft_activities_from_address" ON "nft_activities" ("from_address")');
    await queryRunner.query('CREATE INDEX "IDX_nft_activities_to_address" ON "nft_activities" ("to_address")');
    await queryRunner.query('CREATE INDEX "IDX_nft_activities_nft_id" ON "nft_activities" ("nft_id")');
    
    // Alert configs indexes
    await queryRunner.query('CREATE INDEX "IDX_alert_configs_user_id" ON "alert_configs" ("user_id")');
    await queryRunner.query('CREATE INDEX "IDX_alert_configs_collection_id" ON "alert_configs" ("collection_id")');
    await queryRunner.query('CREATE INDEX "IDX_alert_configs_is_active" ON "alert_configs" ("is_active")');
    
    // Notifications indexes
    await queryRunner.query('CREATE INDEX "IDX_notifications_user_id" ON "notifications" ("user_id")');
    await queryRunner.query('CREATE INDEX "IDX_notifications_status" ON "notifications" ("status")');
    await queryRunner.query('CREATE INDEX "IDX_notifications_scheduled_at" ON "notifications" ("scheduled_at")');
    await queryRunner.query('CREATE INDEX "IDX_notifications_channel" ON "notifications" ("channel")');
    
    // Ledger sync status indexes
    await queryRunner.query('CREATE INDEX "IDX_ledger_sync_status_close_time" ON "ledger_sync_status" ("close_time")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop tables in reverse order (due to foreign key constraints)
    await queryRunner.query('DROP TABLE IF EXISTS "notifications"');
    await queryRunner.query('DROP TABLE IF EXISTS "alert_configs"');
    await queryRunner.query('DROP TABLE IF EXISTS "ledger_sync_status"');
    await queryRunner.query('DROP TABLE IF EXISTS "nft_activities"');
    await queryRunner.query('DROP TABLE IF EXISTS "nfts"');
    await queryRunner.query('DROP TABLE IF EXISTS "collections"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
    
    // Drop extension
    await queryRunner.query('DROP EXTENSION IF EXISTS "uuid-ossp"');
  }
}