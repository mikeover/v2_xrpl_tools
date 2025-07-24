import { MigrationInterface, QueryRunner } from 'typeorm';

export class TimescaleDBSetupDisabled1737744000001 implements MigrationInterface {
  name = 'TimescaleDBSetupDisabled1737744000001';

  public async up(_queryRunner: QueryRunner): Promise<void> {
    // TimescaleDB setup disabled for local development without TimescaleDB
    // The nft_activities table will work as a regular PostgreSQL table
    
    console.log('⚠️  TimescaleDB setup skipped - running with regular PostgreSQL');
    console.log('   For production, use TimescaleDB for optimal time-series performance');
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Nothing to revert
  }
}