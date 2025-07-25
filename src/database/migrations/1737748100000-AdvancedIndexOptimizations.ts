import { MigrationInterface, QueryRunner } from 'typeorm';

export class AdvancedIndexOptimizations1737748100000 implements MigrationInterface {
  name = 'AdvancedIndexOptimizations1737748100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // =======================
    // HIGH-IMPACT COMPOSITE INDEXES
    // =======================

    // 1. NFT Activities - Price analysis and market queries
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_nft_activities_price_analysis"
      ON "nft_activities" ("activity_type", "price_drops", "timestamp")
      WHERE "price_drops" IS NOT NULL
    `);

    // 2. NFT Activities - User-specific activity tracking
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_nft_activities_user_timeline"
      ON "nft_activities" ("from_address", "timestamp")
    `);

    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_nft_activities_user_received"
      ON "nft_activities" ("to_address", "timestamp")
    `);

    // 3. NFT Activities - Collection analytics
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_nft_activities_collection_analytics"
      ON "nft_activities" ("nft_id", "activity_type", "timestamp")
    `);

    // 4. Alert matching optimization - most critical for performance
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_alert_configs_active_matching"
      ON "alert_configs" ("is_active", "collection_id", "activity_types")
      WHERE "is_active" = true
    `);

    // 5. Notification processing queue optimization
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_notifications_processing_queue"
      ON "notifications" ("status", "scheduled_at", "retry_count")
      WHERE "status" IN ('pending', 'failed')
    `);

    // =======================
    // JSONB INDEXES FOR TRAIT FILTERING
    // =======================

    // 6. NFT traits filtering (GIN index for efficient JSONB queries)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_nfts_traits_gin"
      ON "nfts" USING GIN ("traits")
      WHERE "traits" IS NOT NULL
    `);

    // 7. NFT metadata filtering
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_nfts_metadata_gin"
      ON "nfts" USING GIN ("metadata")
      WHERE "metadata" IS NOT NULL
    `);

    // 8. Alert config trait filters (for efficient alert matching)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_alert_configs_trait_filters_gin"
      ON "alert_configs" USING GIN ("trait_filters")
      WHERE "trait_filters" IS NOT NULL AND "is_active" = true
    `);

    // =======================
    // TIME-SERIES OPTIMIZATIONS
    // =======================

    // 9. NFT Activities time-series partitioning helper (for future sharding)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_nft_activities_time_partitioning"
      ON "nft_activities" ("timestamp", "ledger_index")
    `);

    // 10. Recent activities optimization (frequently accessed data)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_nft_activities_recent"
      ON "nft_activities" ("timestamp" DESC, "activity_type")
      WHERE "timestamp" > NOW() - INTERVAL '30 days'
    `);

    // =======================
    // API PERFORMANCE INDEXES
    // =======================

    // 11. Collection discovery and stats
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_collections_stats"
      ON "collections" ("issuer_address", "created_at", "name")
    `);

    // 12. NFT ownership queries (for portfolio views)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_nfts_owner_collection"
      ON "nfts" ("owner_address", "collection_id", "last_activity_at")
    `);

    // 13. Ledger sync monitoring and gap detection
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_ledger_sync_gap_detection"
      ON "ledger_sync_status" ("ledger_index", "processed_at")
    `);

    // =======================
    // METADATA ENRICHMENT OPTIMIZATION
    // =======================

    // 14. Metadata enrichment queue processing
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_metadata_enrichment_processing"
      ON "metadata_enrichment_queue" ("status", "next_retry_at", "retry_count")
      WHERE "status" IN ('pending', 'failed')
    `);

    // 15. NFTs missing metadata (for enrichment prioritization)
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_nfts_missing_metadata"
      ON "nfts" ("created_at")
      WHERE "metadata_fetched_at" IS NULL AND "metadata_uri" IS NOT NULL
    `);

    // =======================
    // USER EXPERIENCE INDEXES
    // =======================

    // 16. User dashboard queries
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_users_active_login"
      ON "users" ("is_active", "last_login_at")
      WHERE "is_active" = true
    `);

    // 17. User notification history
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS "IDX_notifications_user_history"
      ON "notifications" ("user_id", "created_at" DESC, "status")
    `);

    // =======================
    // STATISTICS UPDATE
    // =======================

    // Update table statistics for query planner optimization
    await queryRunner.query('ANALYZE "nft_activities"');
    await queryRunner.query('ANALYZE "nfts"');
    await queryRunner.query('ANALYZE "alert_configs"');
    await queryRunner.query('ANALYZE "notifications"');
    await queryRunner.query('ANALYZE "collections"');

    console.log('✅ Advanced database indexes created successfully');
    console.log('📊 Query performance should be significantly improved for:');
    console.log('   - NFT activity analysis and filtering');
    console.log('   - Real-time alert matching');
    console.log('   - User portfolio and activity tracking');
    console.log('   - Collection analytics and market data');
    console.log('   - JSONB trait and metadata filtering');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop all indexes in reverse order
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_notifications_user_history"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_users_active_login"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_nfts_missing_metadata"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_metadata_enrichment_processing"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_ledger_sync_gap_detection"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_nfts_owner_collection"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_collections_stats"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_nft_activities_recent"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_nft_activities_time_partitioning"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_alert_configs_trait_filters_gin"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_nfts_metadata_gin"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_nfts_traits_gin"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_notifications_processing_queue"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_alert_configs_active_matching"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_nft_activities_collection_analytics"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_nft_activities_user_received"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_nft_activities_user_timeline"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_nft_activities_price_analysis"');

    console.log('🗑️  Advanced database indexes removed');
  }
}