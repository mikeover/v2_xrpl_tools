import { MigrationInterface, QueryRunner } from 'typeorm';

export class TimescaleDBSetup1737744000001 implements MigrationInterface {
  name = 'TimescaleDBSetup1737744000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create TimescaleDB extension
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE');

    // Convert nft_activities table to hypertable for time-series optimization
    // This partitions the table by time for better performance with large datasets
    await queryRunner.query(`
      SELECT create_hypertable('nft_activities', 'timestamp', 
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE
      )
    `);

    // Create continuous aggregates for common queries
    // This creates materialized views that automatically update
    
    // Daily NFT activity summary
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS nft_activities_daily
      WITH (timescaledb.continuous) AS
      SELECT 
        time_bucket('1 day', timestamp) AS day,
        activity_type,
        COUNT(*) as activity_count,
        COUNT(DISTINCT nft_id) as unique_nfts,
        AVG(price_drops::numeric) as avg_price,
        MAX(price_drops::numeric) as max_price,
        MIN(price_drops::numeric) as min_price
      FROM nft_activities 
      WHERE timestamp > NOW() - INTERVAL '90 days'
        AND price_drops IS NOT NULL
      GROUP BY day, activity_type
      WITH NO DATA
    `);

    // Add refresh policy for the continuous aggregate
    await queryRunner.query(`
      SELECT add_continuous_aggregate_policy('nft_activities_daily',
        start_offset => INTERVAL '3 days',
        end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour',
        if_not_exists => TRUE
      )
    `);

    // Hourly NFT activity summary for recent data
    await queryRunner.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS nft_activities_hourly
      WITH (timescaledb.continuous) AS
      SELECT 
        time_bucket('1 hour', timestamp) AS hour,
        activity_type,
        COUNT(*) as activity_count,
        COUNT(DISTINCT nft_id) as unique_nfts
      FROM nft_activities 
      WHERE timestamp > NOW() - INTERVAL '7 days'
      GROUP BY hour, activity_type
      WITH NO DATA
    `);

    // Add refresh policy for hourly aggregate
    await queryRunner.query(`
      SELECT add_continuous_aggregate_policy('nft_activities_hourly',
        start_offset => INTERVAL '12 hours',
        end_offset => INTERVAL '10 minutes',
        schedule_interval => INTERVAL '10 minutes',
        if_not_exists => TRUE
      )
    `);

    // Create data retention policy (keep raw data for 1 year)
    await queryRunner.query(`
      SELECT add_retention_policy('nft_activities', 
        INTERVAL '1 year',
        if_not_exists => TRUE
      )
    `);

    // Create compression policy for older data
    await queryRunner.query(`
      SELECT add_compression_policy('nft_activities', 
        INTERVAL '7 days',
        if_not_exists => TRUE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove policies
    await queryRunner.query(`
      SELECT remove_retention_policy('nft_activities', if_exists => TRUE)
    `);
    
    await queryRunner.query(`
      SELECT remove_compression_policy('nft_activities', if_exists => TRUE)
    `);

    // Drop continuous aggregates
    await queryRunner.query('DROP MATERIALIZED VIEW IF EXISTS nft_activities_hourly');
    await queryRunner.query('DROP MATERIALIZED VIEW IF EXISTS nft_activities_daily');

    // Convert back to regular table (this is destructive!)
    // In practice, you might not want to do this in production
    await queryRunner.query(`
      CREATE TABLE nft_activities_backup AS SELECT * FROM nft_activities
    `);
    
    await queryRunner.query('DROP TABLE IF EXISTS nft_activities CASCADE');
    
    await queryRunner.query(`
      ALTER TABLE nft_activities_backup RENAME TO nft_activities
    `);

    // Drop TimescaleDB extension (be careful in production!)
    await queryRunner.query('DROP EXTENSION IF EXISTS timescaledb CASCADE');
  }
}