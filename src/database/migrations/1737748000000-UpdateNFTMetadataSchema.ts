import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateNFTMetadataSchema1737748000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, rename cached_image_url to image_s3_url if it exists
    await queryRunner.query(`
      DO $$ 
      BEGIN 
        IF EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'nfts' 
                   AND column_name = 'cached_image_url') THEN
          ALTER TABLE nfts RENAME COLUMN cached_image_url TO image_s3_url;
        END IF;
      END $$;
    `);

    // Add new columns to nfts table
    await queryRunner.query(`
      ALTER TABLE nfts
      ADD COLUMN IF NOT EXISTS metadata_uri_hex VARCHAR(2048),
      ADD COLUMN IF NOT EXISTS image_s3_url VARCHAR(2048),
      ADD COLUMN IF NOT EXISTS metadata_fetched_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS image_fetched_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS metadata_fetch_error TEXT,
      ADD COLUMN IF NOT EXISTS image_fetch_error TEXT
    `);

    // Create indexes for better query performance
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_nfts_metadata_fetched_at 
      ON nfts(metadata_fetched_at);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_nfts_metadata_uri 
      ON nfts(metadata_uri);
    `);

    // Create a metadata enrichment status table for tracking
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS metadata_enrichment_queue (
        id SERIAL PRIMARY KEY,
        nft_id VARCHAR(64) NOT NULL UNIQUE,
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        retry_count INTEGER DEFAULT 0,
        last_attempt_at TIMESTAMP,
        next_retry_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_enrichment_nft FOREIGN KEY (nft_id) REFERENCES nfts(nft_id) ON DELETE CASCADE
      )
    `);

    // Create index for queue processing
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_enrichment_queue_status_retry 
      ON metadata_enrichment_queue(status, next_retry_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop enrichment queue table
    await queryRunner.query(`DROP TABLE IF EXISTS metadata_enrichment_queue`);

    // Remove indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_nfts_metadata_fetched_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_nfts_metadata_uri`);

    // Remove columns from nfts table
    await queryRunner.query(`
      ALTER TABLE nfts
      DROP COLUMN IF EXISTS metadata_uri_hex,
      DROP COLUMN IF EXISTS metadata_uri,
      DROP COLUMN IF EXISTS metadata,
      DROP COLUMN IF EXISTS image_url,
      DROP COLUMN IF EXISTS image_s3_url,
      DROP COLUMN IF EXISTS metadata_fetched_at,
      DROP COLUMN IF EXISTS image_fetched_at,
      DROP COLUMN IF EXISTS metadata_fetch_error,
      DROP COLUMN IF EXISTS image_fetch_error
    `);
  }
}