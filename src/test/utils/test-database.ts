/**
 * Test Database Setup and Management
 * 
 * Provides utilities for setting up isolated test databases,
 * running migrations, and cleaning up after tests.
 */

import { DataSource } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

// Import all entities
import { UserEntity } from '../../database/entities/user.entity';
import { CollectionEntity } from '../../database/entities/collection.entity';
import { NftEntity } from '../../database/entities/nft.entity';
import { NftActivityEntity } from '../../database/entities/nft-activity.entity';
import { AlertConfigEntity } from '../../database/entities/alert-config.entity';
import { NotificationEntity } from '../../database/entities/notification.entity';
import { LedgerSyncStatusEntity } from '../../database/entities/ledger-sync-status.entity';
import { ApiKeyEntity } from '../../database/entities/api-key.entity';
import { RefreshTokenEntity } from '../../database/entities/refresh-token.entity';

export class TestDatabase {
  private static instance: TestDatabase;
  private dataSource: DataSource | null = null;
  private testDatabaseName: string;

  private constructor() {
    // Generate unique database name for this test run
    this.testDatabaseName = `xrpl_test_${uuidv4().replace(/-/g, '')}`;
  }

  static getInstance(): TestDatabase {
    if (!TestDatabase.instance) {
      TestDatabase.instance = new TestDatabase();
    }
    return TestDatabase.instance;
  }

  /**
   * Initialize test database with fresh schema
   */
  async initialize(): Promise<DataSource> {
    if (this.dataSource?.isInitialized) {
      return this.dataSource;
    }

    // First, create the test database
    await this.createTestDatabase();

    // Create DataSource for the test database
    this.dataSource = new DataSource({
      type: 'postgres',
      host: process.env['TEST_DATABASE_HOST'] || process.env['DATABASE_HOST'] || 'localhost',
      port: parseInt(process.env['TEST_DATABASE_PORT'] || process.env['DATABASE_PORT'] || '5432', 10),
      username: process.env['TEST_DATABASE_USERNAME'] || process.env['DATABASE_USERNAME'] || 'postgres',
      password: process.env['TEST_DATABASE_PASSWORD'] || process.env['DATABASE_PASSWORD'] || 'postgres',
      database: this.testDatabaseName,
      entities: [
        UserEntity,
        CollectionEntity,
        NftEntity,
        NftActivityEntity,
        AlertConfigEntity,
        NotificationEntity,
        LedgerSyncStatusEntity,
        ApiKeyEntity,
        RefreshTokenEntity,
      ],
      migrations: [path.join(__dirname, '../../database/migrations/*.ts')],
      synchronize: false, // Use migrations for schema
      logging: process.env['NODE_ENV'] === 'test-verbose',
      dropSchema: false,
    });

    await this.dataSource.initialize();

    // Run migrations to set up schema
    await this.dataSource.runMigrations();

    console.log(`✅ Test database initialized: ${this.testDatabaseName}`);
    return this.dataSource;
  }

  /**
   * Create the test database
   */
  private async createTestDatabase(): Promise<void> {
    const adminDataSource = new DataSource({
      type: 'postgres',
      host: process.env['TEST_DATABASE_HOST'] || process.env['DATABASE_HOST'] || 'localhost',
      port: parseInt(process.env['TEST_DATABASE_PORT'] || process.env['DATABASE_PORT'] || '5432', 10),
      username: process.env['TEST_DATABASE_USERNAME'] || process.env['DATABASE_USERNAME'] || 'postgres',
      password: process.env['TEST_DATABASE_PASSWORD'] || process.env['DATABASE_PASSWORD'] || 'postgres',
      database: 'postgres', // Connect to default database to create test DB
    });

    await adminDataSource.initialize();

    try {
      // Create test database
      await adminDataSource.query(`CREATE DATABASE "${this.testDatabaseName}"`);
    } catch (error) {
      // Database might already exist, which is fine for some test scenarios
      if (!(error as Error).message.includes('already exists')) {
        throw error;
      }
    }

    await adminDataSource.destroy();
  }

  /**
   * Get the current test database connection
   */
  getDataSource(): DataSource {
    if (!this.dataSource?.isInitialized) {
      throw new Error('Test database not initialized. Call initialize() first.');
    }
    return this.dataSource;
  }

  /**
   * Clean all data from tables while preserving schema
   */
  async cleanDatabase(): Promise<void> {
    if (!this.dataSource?.isInitialized) {
      return;
    }

    const entities = this.dataSource.entityMetadatas;

    // Disable foreign key checks temporarily
    await this.dataSource.query('SET session_replication_role = replica;');

    try {
      // Truncate all tables
      for (const entity of entities) {
        await this.dataSource.query(`TRUNCATE TABLE "${entity.tableName}" RESTART IDENTITY CASCADE;`);
      }
    } finally {
      // Re-enable foreign key checks
      await this.dataSource.query('SET session_replication_role = DEFAULT;');
    }
  }

  /**
   * Seed database with test data
   */
  async seedTestData(): Promise<{
    users: UserEntity[];
    collections: CollectionEntity[];
    nfts: NftEntity[];
    activities: NftActivityEntity[];
    alertConfigs: AlertConfigEntity[];
  }> {
    const userRepository = this.dataSource!.getRepository(UserEntity);
    const collectionRepository = this.dataSource!.getRepository(CollectionEntity);
    const nftRepository = this.dataSource!.getRepository(NftEntity);
    const activityRepository = this.dataSource!.getRepository(NftActivityEntity);
    const alertConfigRepository = this.dataSource!.getRepository(AlertConfigEntity);

    // Create test users
    const users = await userRepository.save([
      {
        email: 'test1@example.com',
        passwordHash: '$2b$10$test.hash.1',
        firstName: 'Test',
        lastName: 'User1',
        isActive: true,
        emailVerified: true,
      },
      {
        email: 'test2@example.com',
        passwordHash: '$2b$10$test.hash.2',
        firstName: 'Test',
        lastName: 'User2',
        isActive: true,
        emailVerified: true,
      },
    ]);

    // Create test collections
    const collections = await collectionRepository.save([
      {
        issuerAddress: 'rTest1Collection1234567890123456789',
        taxon: 1,
        name: 'Test Collection 1',
        metadata: {
          description: 'A test collection for unit tests',
          image: 'https://example.com/collection1.png',
        },
      },
      {
        issuerAddress: 'rTest2Collection1234567890123456789',
        taxon: 2,
        name: 'Test Collection 2',
        metadata: {
          description: 'Another test collection',
          image: 'https://example.com/collection2.png',
        },
      },
    ]);

    // Create test NFTs
    const nfts = await nftRepository.save([
      {
        nftId: '000813881BC9F8162F4B65AE9A8B5A1B2C3D4E5F6789ABCDEF0123456789ABCDEF',
        collectionId: collections[0]!.id,
        ownerAddress: 'rTestOwner1234567890123456789012',
        metadataUri: 'https://ipfs.io/ipfs/QmTest123456789',
        metadata: {
          name: 'Test NFT #1',
          description: 'A test NFT',
          image: 'https://example.com/nft1.png',
          attributes: [
            { trait_type: 'Color', value: 'Blue' },
            { trait_type: 'Rarity', value: 'Common' },
          ],
        },
        traits: {
          color: 'Blue',
          rarity: 'Common',
        },
        imageUrl: 'https://example.com/nft1.png',
        metadataFetchedAt: new Date(),
        lastActivityAt: new Date(),
      },
      {
        nftId: '000813881BC9F8162F4B65AE9A8B5A1B2C3D4E5F6789ABCDEF9876543210FEDCBA',
        collectionId: collections[1]!.id,
        ownerAddress: 'rTestOwner2234567890123456789012',
        metadataUri: 'https://ipfs.io/ipfs/QmTest987654321',
        metadata: {
          name: 'Test NFT #2',
          description: 'Another test NFT',
          image: 'https://example.com/nft2.png',
          attributes: [
            { trait_type: 'Color', value: 'Red' },
            { trait_type: 'Rarity', value: 'Rare' },
          ],
        },
        traits: {
          color: 'Red',
          rarity: 'Rare',
        },
        imageUrl: 'https://example.com/nft2.png',
        metadataFetchedAt: new Date(),
        lastActivityAt: new Date(),
      },
    ]);

    // Create test activities
    const activities = await activityRepository.save([
      {
        nftId: nfts[0]!.id,
        transactionHash: 'E3FE6EA3D48F0C2B963C5CAD5DB7834CD39A5394E63C2688A87FCBE76EE2A1E1',
        ledgerIndex: '75000000',
        activityType: 'mint',
        fromAddress: null,
        toAddress: 'rTestOwner1234567890123456789012',
        priceDrops: null,
        currency: null,
        issuer: null,
        timestamp: new Date(Date.now() - 3600000), // 1 hour ago
        metadata: {
          transactionType: 'NFTokenMint',
          fee: '12',
          flags: 8,
          engineResult: 'tesSUCCESS',
        },
      },
      {
        nftId: nfts[1]!.id,
        transactionHash: 'D2ED5D9CB4E8F1A0853B4B9A4CA6C723B28A4283D52B1577786EABD55DD190D0',
        ledgerIndex: '75000100',
        activityType: 'sale',
        fromAddress: 'rTestSeller234567890123456789012',
        toAddress: 'rTestOwner2234567890123456789012',
        priceDrops: '1000000000', // 1000 XRP
        currency: 'XRP',
        issuer: null,
        timestamp: new Date(Date.now() - 1800000), // 30 minutes ago
        metadata: {
          transactionType: 'NFTokenAcceptOffer',
          fee: '12',
          flags: 0,
          engineResult: 'tesSUCCESS',
        },
      },
    ]);

    // Create test alert configs
    const alertConfigs = await alertConfigRepository.save([
      {
        userId: users[0]!.id,
        name: 'Test Alert 1',
        collectionId: collections[0]!.id,
        activityTypes: ['mint', 'sale'],
        minPriceDrops: '1000000', // 1 XRP
        maxPriceDrops: null,
        traitFilters: { rarity: 'Common' },
        notificationChannels: {
          discord: { enabled: true, webhookUrl: 'https://discord.com/api/webhooks/test' },
          email: { enabled: true },
        },
        isActive: true,
      },
      {
        userId: users[1]!.id,
        name: 'Test Alert 2',
        collectionId: null, // Global alert
        activityTypes: ['sale'],
        minPriceDrops: '10000000000', // 10,000 XRP
        maxPriceDrops: null,
        traitFilters: null,
        notificationChannels: {
          email: { enabled: true },
        },
        isActive: true,
      },
    ]);

    return {
      users,
      collections,
      nfts,
      activities,
      alertConfigs,
    };
  }

  /**
   * Drop the test database completely
   */
  async destroy(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
    }

    // Connect to admin database to drop test database
    const adminDataSource = new DataSource({
      type: 'postgres',
      host: process.env['TEST_DATABASE_HOST'] || process.env['DATABASE_HOST'] || 'localhost',
      port: parseInt(process.env['TEST_DATABASE_PORT'] || process.env['DATABASE_PORT'] || '5432', 10),
      username: process.env['TEST_DATABASE_USERNAME'] || process.env['DATABASE_USERNAME'] || 'postgres',
      password: process.env['TEST_DATABASE_PASSWORD'] || process.env['DATABASE_PASSWORD'] || 'postgres',
      database: 'postgres',
    });

    await adminDataSource.initialize();

    try {
      // Terminate active connections to test database
      await adminDataSource.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
          AND pid <> pg_backend_pid()
      `, [this.testDatabaseName]);

      // Drop test database
      await adminDataSource.query(`DROP DATABASE IF EXISTS "${this.testDatabaseName}"`);
      console.log(`🗑️  Test database dropped: ${this.testDatabaseName}`);
    } catch (error) {
      console.warn(`Warning: Could not drop test database ${this.testDatabaseName}:`, error);
    }

    await adminDataSource.destroy();
    this.dataSource = null;
  }

  /**
   * Get database statistics for testing
   */
  async getStats(): Promise<{
    tableName: string;
    rowCount: number;
  }[]> {
    if (!this.dataSource?.isInitialized) {
      return [];
    }

    const entities = this.dataSource.entityMetadatas;
    const stats = [];

    for (const entity of entities) {
      const result = await this.dataSource.query(
        `SELECT COUNT(*) as count FROM "${entity.tableName}"`
      );
      stats.push({
        tableName: entity.tableName,
        rowCount: parseInt(result[0].count, 10),
      });
    }

    return stats;
  }
}

/**
 * Jest setup/teardown helpers
 */

export async function setupTestDatabase(): Promise<DataSource> {
  const testDb = TestDatabase.getInstance();
  return await testDb.initialize();
}

export async function cleanTestDatabase(): Promise<void> {
  const testDb = TestDatabase.getInstance();
  await testDb.cleanDatabase();
}

export async function seedTestDatabase() {
  const testDb = TestDatabase.getInstance();
  return await testDb.seedTestData();
}

export async function teardownTestDatabase(): Promise<void> {
  const testDb = TestDatabase.getInstance();
  await testDb.destroy();
}

export function getTestDataSource(): DataSource {
  const testDb = TestDatabase.getInstance();
  return testDb.getDataSource();
}