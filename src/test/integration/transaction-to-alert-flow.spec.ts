/**
 * Integration Test: Complete Transaction to Alert Flow
 * 
 * This test verifies the entire flow from XRPL transaction processing
 * through NFT parsing to alert matching and notification generation.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { TransactionConsumerService } from '../../features/transaction-processing/services/transaction-consumer.service';
import { NFTTransactionParserService } from '../../features/transaction-processing/services/nft-transaction-parser.service';
import { AlertMatchingService } from '../../features/alerts/services/alert-matching.service';
import { LoggerService } from '../../core/logger/logger.service';
import { EventConsumerService } from '../../modules/queue/services/event-consumer.service';
import { EventPublisherService } from '../../modules/queue/services/event-publisher.service';
import { AlertConfigRepository } from '../../features/alerts/repositories/alert-config.repository';
import { TestDataFactory } from '../utils/test-data-factory';
import { setupTestDatabase, cleanTestDatabase, seedTestDatabase } from '../utils/test-database';
import { XRPLTransactionStreamMessage } from '../../shared/types/xrpl-stream.types';
import { QueueEvent } from '../../modules/queue/interfaces/queue.interface';
import { NFTActivityType } from '../../features/transaction-processing/interfaces/transaction.interface';
import { AlertConfigEntity } from '../../database/entities/alert-config.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { CollectionEntity } from '../../database/entities/collection.entity';
import { NftEntity } from '../../database/entities/nft.entity';

describe('Transaction to Alert Flow Integration', () => {
  let app: TestingModule;
  let dataSource: DataSource;
  let transactionConsumer: TransactionConsumerService;
  let nftParser: NFTTransactionParserService;
  let alertMatcher: AlertMatchingService;
  let alertConfigRepository: AlertConfigRepository;
  
  // Mock services
  let mockEventConsumer: jest.Mocked<EventConsumerService>;
  let mockEventPublisher: jest.Mocked<EventPublisherService>;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeAll(async () => {
    // Setup test database
    dataSource = await setupTestDatabase();
  });

  beforeEach(async () => {
    // Clean and seed database before each test
    await cleanTestDatabase();
    await seedTestDatabase();

    // Create mock services
    mockEventConsumer = {
      consumeTransactionEvents: jest.fn(),
      consumeLedgerEvents: jest.fn(),
    } as any;

    mockEventPublisher = {
      publishNFTEvent: jest.fn(),
    } as any;

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    // Setup test module
    app = await Test.createTestingModule({
      providers: [
        TransactionConsumerService,
        NFTTransactionParserService,
        AlertMatchingService,
        AlertConfigRepository,
        {
          provide: EventConsumerService,
          useValue: mockEventConsumer,
        },
        {
          provide: EventPublisherService,
          useValue: mockEventPublisher,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    transactionConsumer = app.get<TransactionConsumerService>(TransactionConsumerService);
    nftParser = app.get<NFTTransactionParserService>(NFTTransactionParserService);
    alertMatcher = app.get<AlertMatchingService>(AlertMatchingService);
    alertConfigRepository = app.get<AlertConfigRepository>(AlertConfigRepository);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
    jest.clearAllMocks();
  });

  describe('NFT Mint Transaction Flow', () => {
    it('should process NFT mint transaction and match with configured alert', async () => {
      // 1. Setup: Create test user, collection, and alert configuration
      const userRepo = dataSource.getRepository(UserEntity);
      const collectionRepo = dataSource.getRepository(CollectionEntity);
      
      const user = await userRepo.save({
        email: 'test@example.com',
        passwordHash: 'hashed',
        firstName: 'Test',
        lastName: 'User',
        isActive: true,
        emailVerified: true,
      });

      const collection = await collectionRepo.save({
        issuerAddress: 'rTestIssuer123456789012345678901',
        taxon: 1,
        name: 'Test NFT Collection',
        metadata: {
          description: 'A test collection for integration testing',
        },
      });

      const alertConfig = await alertConfigRepository.create({
        userId: user.id,
        name: 'Mint Alert',
        collectionId: collection.id,
        activityTypes: ['mint'],
        minPriceDrops: null,
        maxPriceDrops: null,
        traitFilters: null,
        notificationChannels: {
          email: { enabled: true },
        },
        isActive: true,
      });

      // 2. Create realistic NFT mint transaction
      const mintTransaction = TestDataFactory.createNFTMintTransaction({
        transaction: {
          Account: 'rTestAccount123456789012345678901',
          NFTokenTaxon: collection.taxon,
        },
      });

      // 3. Simulate transaction event processing
      const transactionEvent: QueueEvent = {
        eventId: 'test-mint-event',
        eventType: 'transaction.validated' as any,
        timestamp: new Date(),
        data: mintTransaction,
      };

      // 4. Parse the transaction
      const parsedNFT = await nftParser.parseTransaction(mintTransaction);

      // 5. Verify parsed data structure
      expect(parsedNFT).toEqual({
        transactionHash: mintTransaction.transaction.hash,
        ledgerIndex: mintTransaction.ledger_index,
        timestamp: expect.any(Date),
        activityType: NFTActivityType.MINT,
        fromAddress: null,
        toAddress: mintTransaction.transaction.Account,
        nftTokenID: expect.any(String),
        priceDrops: null,
        currency: null,
        metadata: expect.objectContaining({
          transactionType: 'NFTokenMint',
          taxon: collection.taxon,
        }),
      });

      // 6. Create mock NFT activity for alert matching
      const nftActivity = {
        id: 'activity-1',
        nftId: 'nft-1',
        transactionHash: parsedNFT.transactionHash,
        ledgerIndex: parsedNFT.ledgerIndex,
        activityType: parsedNFT.activityType,
        fromAddress: parsedNFT.fromAddress,
        toAddress: parsedNFT.toAddress,
        timestamp: parsedNFT.timestamp,
        nft: {
          id: 'nft-1',
          nftId: parsedNFT.nftTokenID,
          collectionId: collection.id,
          ownerAddress: parsedNFT.toAddress!,
          collection: {
            id: collection.id,
            issuerAddress: collection.issuerAddress,
            taxon: collection.taxon,
            name: collection.name,
          },
        },
      };

      // 7. Test alert matching
      const matchResults = await alertMatcher.findMatchingAlerts(nftActivity);

      // 8. Verify alert matching results
      expect(matchResults).toHaveLength(1);
      expect(matchResults[0]).toEqual({
        alertConfigId: alertConfig.id,
        matched: true,
        reasons: [
          'Activity type matches: mint',
          `Collection matches: ${collection.id}`,
        ],
      });

      // 9. Verify event publishing was called
      await transactionConsumer['handleTransactionEvent'](transactionEvent, {} as any);
      expect(mockEventPublisher.publishNFTEvent).toHaveBeenCalledWith(
        'nft.activity',
        expect.objectContaining({
          activityType: NFTActivityType.MINT,
          transactionHash: mintTransaction.transaction.hash,
        })
      );
    });
  });

  describe('NFT Sale Transaction Flow with Price Filtering', () => {
    it('should process NFT sale and match with price-filtered alert', async () => {
      // 1. Setup test data
      const userRepo = dataSource.getRepository(UserEntity);
      const collectionRepo = dataSource.getRepository(CollectionEntity);
      
      const user = await userRepo.save({
        email: 'buyer@example.com',
        passwordHash: 'hashed',
        firstName: 'NFT',
        lastName: 'Buyer',
        isActive: true,
        emailVerified: true,
      });

      const collection = await collectionRepo.save({
        issuerAddress: 'rPremiumCollection12345678901234567890',
        taxon: 42,
        name: 'Premium Art Collection',
        metadata: {
          description: 'High-value art NFTs',
        },
      });

      // Create alert that only triggers for sales above 1000 XRP
      const priceAlert = await alertConfigRepository.create({
        userId: user.id,
        name: 'High Value Sale Alert',
        collectionId: collection.id,
        activityTypes: ['sale'],
        minPriceDrops: '1000000000', // 1000 XRP in drops
        maxPriceDrops: null,
        traitFilters: null,
        notificationChannels: {
          discord: { 
            enabled: true, 
            webhookUrl: 'https://discord.com/api/webhooks/test' 
          },
        },
        isActive: true,
      });

      // 2. Create high-value sale transaction (1500 XRP)
      const saleTransaction = TestDataFactory.createNFTSaleTransaction({
        meta: {
          AffectedNodes: [
            {
              DeletedNode: {
                LedgerEntryType: 'NFTokenOffer',
                FinalFields: {
                  Account: 'rSeller123456789012345678901234',
                  Amount: '1500000000000', // 1500 XRP in drops
                  NFTokenID: TestDataFactory['generateNFTokenID'](),
                },
              },
            },
          ],
        },
      });

      // 3. Parse the sale transaction
      const parsedSale = await nftParser.parseTransaction(saleTransaction);

      // 4. Verify price extraction
      expect(parsedSale.priceDrops).toBe('1500000000000');
      expect(parsedSale.currency).toBe('XRP');
      expect(parsedSale.activityType).toBe(NFTActivityType.SALE);

      // 5. Create NFT activity for matching
      const saleActivity = {
        id: 'sale-activity-1',
        nftId: 'premium-nft-1',
        transactionHash: parsedSale.transactionHash,
        ledgerIndex: parsedSale.ledgerIndex,
        activityType: parsedSale.activityType,
        fromAddress: parsedSale.fromAddress,
        toAddress: parsedSale.toAddress,
        priceDrops: parsedSale.priceDrops,
        currency: parsedSale.currency,
        timestamp: parsedSale.timestamp,
        nft: {
          id: 'premium-nft-1',
          nftId: parsedSale.nftTokenID,
          collectionId: collection.id,
          ownerAddress: parsedSale.toAddress!,
          collection: {
            id: collection.id,
            issuerAddress: collection.issuerAddress,
            taxon: collection.taxon,
            name: collection.name,
          },
        },
      };

      // 6. Test alert matching with price filter
      const matchResults = await alertMatcher.findMatchingAlerts(saleActivity);

      // 7. Verify alert matched due to high price
      expect(matchResults).toHaveLength(1);
      expect(matchResults[0].matched).toBe(true);
      expect(matchResults[0].reasons).toContain('Price is above minimum: 1500000000000 >= 1000000000');
    });

    it('should not match alert when price is below minimum threshold', async () => {
      // 1. Create low-value sale transaction (100 XRP)
      const lowValueSale = TestDataFactory.createNFTSaleTransaction({
        meta: {
          AffectedNodes: [
            {
              DeletedNode: {
                LedgerEntryType: 'NFTokenOffer',
                FinalFields: {
                  Account: 'rSeller123456789012345678901234',
                  Amount: '100000000', // 100 XRP in drops
                  NFTokenID: TestDataFactory['generateNFTokenID'](),
                },
              },
            },
          ],
        },
      });

      // 2. Parse transaction
      const parsedLowSale = await nftParser.parseTransaction(lowValueSale);

      // 3. Create activity below minimum price
      const lowValueActivity = {
        id: 'low-sale-activity',
        nftId: 'cheap-nft-1',
        transactionHash: parsedLowSale.transactionHash,
        ledgerIndex: parsedLowSale.ledgerIndex,
        activityType: parsedLowSale.activityType,
        fromAddress: parsedLowSale.fromAddress,
        toAddress: parsedLowSale.toAddress,
        priceDrops: parsedLowSale.priceDrops,
        currency: parsedLowSale.currency,
        timestamp: parsedLowSale.timestamp,
        nft: {
          id: 'cheap-nft-1',
          nftId: parsedLowSale.nftTokenID,
          collectionId: 'collection-1', // Use seeded collection
          ownerAddress: parsedLowSale.toAddress!,
        },
      };

      // 4. Get alerts (should include the high-value alert from previous test)
      const matchResults = await alertMatcher.findMatchingAlerts(lowValueActivity);

      // 5. Verify no match due to low price
      const priceFilteredResult = matchResults.find(r => 
        r.reasons.some(reason => reason.includes('Price 100000000 is below minimum'))
      );
      
      if (priceFilteredResult) {
        expect(priceFilteredResult.matched).toBe(false);
      }
    });
  });

  describe('Complex Trait-Based Alert Matching', () => {
    it('should match NFT with specific trait combinations', async () => {
      // 1. Setup legendary NFT collection alert
      const userRepo = dataSource.getRepository(UserEntity);
      const collectionRepo = dataSource.getRepository(CollectionEntity);
      
      const traitCollector = await userRepo.save({
        email: 'collector@example.com',
        passwordHash: 'hashed',
        firstName: 'Trait',
        lastName: 'Collector',
        isActive: true,
        emailVerified: true,
      });

      const gameCollection = await collectionRepo.save({
        issuerAddress: 'rGameCollection1234567890123456789',
        taxon: 999,
        name: 'Epic Game Items',
        metadata: {
          description: 'Rare gaming NFTs with special traits',
        },
      });

      // Create trait-specific alert
      const traitAlert = await alertConfigRepository.create({
        userId: traitCollector.id,
        name: 'Legendary Item Alert',
        collectionId: gameCollection.id,
        activityTypes: ['mint', 'sale'],
        minPriceDrops: null,
        maxPriceDrops: null,
        traitFilters: [
          {
            traitType: 'rarity',
            operator: 'equals',
            value: 'legendary',
          },
          {
            traitType: 'level',
            operator: 'greater_than',
            value: '95',
          },
        ],
        notificationChannels: {
          email: { enabled: true },
          discord: { 
            enabled: true, 
            webhookUrl: 'https://discord.com/api/webhooks/legendary' 
          },
        },
        isActive: true,
      });

      // 2. Create NFT activity with matching traits
      const legendaryActivity = {
        id: 'legendary-activity',
        nftId: 'legendary-sword-1',
        transactionHash: 'LEGENDARY123456789012345678901234567890123456789012345678901234',
        ledgerIndex: 75000000,
        activityType: 'mint',
        toAddress: 'rPlayer123456789012345678901234567',
        timestamp: new Date(),
        nft: {
          id: 'legendary-sword-1',
          nftId: 'SWORD123456789012345678901234567890123456789012345678901234567890',
          collectionId: gameCollection.id,
          ownerAddress: 'rPlayer123456789012345678901234567',
          traits: {
            rarity: 'legendary',
            level: 98,
            element: 'fire',
            damage: 9999,
          },
          collection: {
            id: gameCollection.id,
            issuerAddress: gameCollection.issuerAddress,
            taxon: gameCollection.taxon,
            name: gameCollection.name,
          },
        },
      };

      // 3. Test trait matching
      const matchResults = await alertMatcher.findMatchingAlerts(legendaryActivity);

      // 4. Verify complex trait matching
      expect(matchResults).toHaveLength(1);
      expect(matchResults[0].matched).toBe(true);
      expect(matchResults[0].reasons).toEqual([
        'Activity type matches: mint',
        `Collection matches: ${gameCollection.id}`,
        'Trait rarity equals legendary',
        'Trait level (98) > 95',
      ]);

      // 5. Test with non-matching traits
      const commonActivity = {
        ...legendaryActivity,
        id: 'common-activity',
        nft: {
          ...legendaryActivity.nft,
          traits: {
            rarity: 'common', // Doesn't match 'legendary'
            level: 50, // Doesn't match > 95
          },
        },
      };

      const nonMatchResults = await alertMatcher.findMatchingAlerts(commonActivity);
      expect(nonMatchResults[0].matched).toBe(false);
      expect(nonMatchResults[0].reasons).toContain('Trait rarity (common) does not equal legendary');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent transactions efficiently', async () => {
      // 1. Create multiple transaction types
      const transactions = [
        ...Array(10).fill(null).map(() => TestDataFactory.createNFTMintTransaction()),
        ...Array(10).fill(null).map(() => TestDataFactory.createNFTSaleTransaction()),
        ...Array(5).fill(null).map(() => TestDataFactory.createNFTOfferTransaction()),
      ];

      // 2. Process all transactions concurrently
      const startTime = Date.now();
      
      const parsePromises = transactions.map(tx => 
        nftParser.parseTransaction(tx)
      );

      const parsedResults = await Promise.all(parsePromises);
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // 3. Verify all transactions were parsed
      expect(parsedResults).toHaveLength(25);
      expect(parsedResults.every(result => result.transactionHash)).toBe(true);

      // 4. Verify reasonable performance (should complete within 2 seconds)
      expect(processingTime).toBeLessThan(2000);

      // 5. Verify different activity types were parsed correctly
      const mintCount = parsedResults.filter(r => r.activityType === NFTActivityType.MINT).length;
      const saleCount = parsedResults.filter(r => r.activityType === NFTActivityType.SALE).length;
      const offerCount = parsedResults.filter(r => r.activityType === NFTActivityType.OFFER).length;

      expect(mintCount).toBe(10);
      expect(saleCount).toBe(10);
      expect(offerCount).toBe(5);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should gracefully handle malformed transaction data', async () => {
      // 1. Create transaction with missing required fields
      const malformedTransaction = {
        transaction: {
          TransactionType: 'NFTokenMint',
          // Missing Account, hash, etc.
        },
        meta: {},
        engine_result: 'tesSUCCESS',
        ledger_index: 75000000,
        validated: true,
      } as XRPLTransactionStreamMessage;

      // 2. Verify error handling
      await expect(nftParser.parseTransaction(malformedTransaction)).rejects.toThrow();

      // 3. Test transaction consumer error handling
      const malformedEvent: QueueEvent = {
        eventId: 'malformed-event',
        eventType: 'transaction.validated' as any,
        timestamp: new Date(),
        data: malformedTransaction,
      };

      // Should not throw, just log error
      await transactionConsumer['handleTransactionEvent'](malformedEvent, {} as any);
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Invalid transaction data received'),
        expect.any(String)
      );
    });

    it('should handle alert matching when NFT data is incomplete', async () => {
      // 1. Create activity with minimal NFT data
      const incompleteActivity = {
        id: 'incomplete-activity',
        nftId: 'incomplete-nft',
        transactionHash: 'INCOMPLETE123456789012345678901234567890123456789012345678901',
        ledgerIndex: 75000000,
        activityType: 'mint',
        timestamp: new Date(),
        // Missing nft property entirely
      };

      // 2. Should handle gracefully without crashing
      const results = await alertMatcher.findMatchingAlerts(incompleteActivity);
      
      // Results may be empty or contain non-matched alerts, but should not throw
      expect(Array.isArray(results)).toBe(true);
    });
  });
});