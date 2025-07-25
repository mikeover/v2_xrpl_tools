import { Test, TestingModule } from '@nestjs/testing';
import { AlertMatchingService, NFTActivity } from './alert-matching.service';
import { AlertConfigRepository } from '../repositories/alert-config.repository';
import { LoggerService } from '../../../core/logger/logger.service';
import { AlertConfigEntity } from '../../../database/entities/alert-config.entity';
import { TraitFilter } from '../interfaces/alert.interface';

describe('AlertMatchingService', () => {
  let service: AlertMatchingService;
  let mockAlertConfigRepository: jest.Mocked<AlertConfigRepository>;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    mockAlertConfigRepository = {
      findAlertsMatchingActivity: jest.fn(),
    } as any;

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertMatchingService,
        {
          provide: AlertConfigRepository,
          useValue: mockAlertConfigRepository,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<AlertMatchingService>(AlertMatchingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findMatchingAlerts', () => {
    let sampleActivity: NFTActivity;
    let sampleAlert: AlertConfigEntity;

    beforeEach(() => {
      sampleActivity = {
        id: 'activity-1',
        nftId: 'nft-1',
        transactionHash: 'tx-hash-123',
        ledgerIndex: 75000000,
        activityType: 'mint',
        toAddress: 'rTestAccount123',
        timestamp: new Date(),
        nft: {
          id: 'nft-1',
          nftId: 'nft-token-123',
          collectionId: 'collection-1',
          ownerAddress: 'rTestAccount123',
          traits: {
            rarity: 'legendary',
            color: 'blue',
            level: 50,
          },
          collection: {
            id: 'collection-1',
            issuerAddress: 'rIssuer123',
            taxon: 1,
            name: 'Test Collection',
          },
        },
      };

      sampleAlert = {
        id: 'alert-1',
        userId: 'user-1',
        name: 'Test Alert',
        collectionId: 'collection-1',
        activityTypes: ['mint', 'sale'],
        minPriceDrops: null,
        maxPriceDrops: null,
        traitFilters: null,
        notificationChannels: {},
        isActive: true,
      } as AlertConfigEntity;
    });

    it('should return matched alerts for valid activity', async () => {
      mockAlertConfigRepository.findAlertsMatchingActivity.mockResolvedValue([sampleAlert]);

      const results = await service.findMatchingAlerts(sampleActivity);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        alertConfigId: 'alert-1',
        matched: true,
        reasons: [
          'Activity type matches: mint',
          'Collection matches: collection-1',
        ],
      });
    });

    it('should return no matches for inactive alerts', async () => {
      const inactiveAlert = { ...sampleAlert, isActive: false };
      mockAlertConfigRepository.findAlertsMatchingActivity.mockResolvedValue([inactiveAlert]);

      const results = await service.findMatchingAlerts(sampleActivity);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        alertConfigId: 'alert-1',
        matched: false,
        reasons: ['Alert is not active'],
      });
    });

    it('should handle repository errors gracefully', async () => {
      mockAlertConfigRepository.findAlertsMatchingActivity.mockRejectedValue(
        new Error('Database connection failed')
      );

      const results = await service.findMatchingAlerts(sampleActivity);

      expect(results).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error finding matching alerts'),
      );
    });

    it('should match global alerts (no collection filter)', async () => {
      const globalAlert = { ...sampleAlert, collectionId: null };
      mockAlertConfigRepository.findAlertsMatchingActivity.mockResolvedValue([globalAlert]);

      const results = await service.findMatchingAlerts(sampleActivity);

      expect(results[0]).toEqual({
        alertConfigId: 'alert-1',
        matched: true,
        reasons: [
          'Activity type matches: mint',
          'Alert applies to all collections',
        ],
      });
    });
  });

  describe('evaluateAlertMatch - Activity Type Matching', () => {
    let baseActivity: NFTActivity;
    let baseAlert: AlertConfigEntity;

    beforeEach(() => {
      baseActivity = {
        id: 'activity-1',
        nftId: 'nft-1',
        transactionHash: 'tx-hash-123',
        ledgerIndex: 75000000,
        activityType: 'sale',
        timestamp: new Date(),
        nft: {
          id: 'nft-1',
          nftId: 'nft-token-123',
          ownerAddress: 'rTestAccount123',
        },
      };

      baseAlert = {
        id: 'alert-1',
        activityTypes: ['mint'],
        isActive: true,
      } as AlertConfigEntity;
    });

    it('should not match when activity type is not in alert filter', () => {
      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result).toEqual({
        alertConfigId: 'alert-1',
        matched: false,
        reasons: ['Activity type does not match'],
      });
    });

    it('should match when activity type is in alert filter', () => {
      baseAlert.activityTypes = ['sale', 'mint'];

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result.matched).toBe(true);
      expect(result.reasons).toContain('Activity type matches: sale');
    });
  });

  describe('evaluateAlertMatch - Collection Matching', () => {
    let baseActivity: NFTActivity;
    let baseAlert: AlertConfigEntity;

    beforeEach(() => {
      baseActivity = {
        id: 'activity-1',
        nftId: 'nft-1',
        transactionHash: 'tx-hash-123',
        ledgerIndex: 75000000,
        activityType: 'sale',
        timestamp: new Date(),
        nft: {
          id: 'nft-1',
          nftId: 'nft-token-123',
          collectionId: 'collection-1',
          ownerAddress: 'rTestAccount123',
        },
      };

      baseAlert = {
        id: 'alert-1',
        activityTypes: ['sale'],
        collectionId: 'collection-1',
        isActive: true,
      } as AlertConfigEntity;
    });

    it('should match when collection IDs match', () => {
      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result.matched).toBe(true);
      expect(result.reasons).toContain('Collection matches: collection-1');
    });

    it('should not match when collection IDs differ', () => {
      baseAlert.collectionId = 'different-collection';

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result).toEqual({
        alertConfigId: 'alert-1',
        matched: false,
        reasons: ['Collection does not match'],
      });
    });

    it('should not match when alert expects collection but activity has none', () => {
      delete baseActivity.nft!.collectionId;

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result).toEqual({
        alertConfigId: 'alert-1',
        matched: false,
        reasons: ['Collection does not match'],
      });
    });
  });

  describe('evaluateAlertMatch - Price Filtering', () => {
    let baseActivity: NFTActivity;
    let baseAlert: AlertConfigEntity;

    beforeEach(() => {
      baseActivity = {
        id: 'activity-1',
        nftId: 'nft-1',
        transactionHash: 'tx-hash-123',
        ledgerIndex: 75000000,
        activityType: 'sale',
        priceDrops: '1000000000', // 1000 XRP
        currency: 'XRP',
        timestamp: new Date(),
        nft: {
          id: 'nft-1',
          nftId: 'nft-token-123',
          ownerAddress: 'rTestAccount123',
        },
      };

      baseAlert = {
        id: 'alert-1',
        activityTypes: ['sale'],
        isActive: true,
      } as AlertConfigEntity;
    });

    it('should match when price is above minimum', () => {
      baseAlert.minPriceDrops = '500000000'; // 500 XRP

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result.matched).toBe(true);
      expect(result.reasons).toContain('Price is above minimum: 1000000000 >= 500000000');
    });

    it('should not match when price is below minimum', () => {
      baseAlert.minPriceDrops = '2000000000'; // 2000 XRP

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result).toEqual({
        alertConfigId: 'alert-1',
        matched: false,
        reasons: ['Price 1000000000 is below minimum 2000000000'],
      });
    });

    it('should match when price is below maximum', () => {
      baseAlert.maxPriceDrops = '2000000000'; // 2000 XRP

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result.matched).toBe(true);
      expect(result.reasons).toContain('Price is below maximum: 1000000000 <= 2000000000');
    });

    it('should not match when price is above maximum', () => {
      baseAlert.maxPriceDrops = '500000000'; // 500 XRP

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result).toEqual({
        alertConfigId: 'alert-1',
        matched: false,
        reasons: ['Price 1000000000 is above maximum 500000000'],
      });
    });

    it('should match when price is within range', () => {
      baseAlert.minPriceDrops = '500000000'; // 500 XRP
      baseAlert.maxPriceDrops = '2000000000'; // 2000 XRP

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result.matched).toBe(true);
      expect(result.reasons).toContain('Price is above minimum: 1000000000 >= 500000000');
      expect(result.reasons).toContain('Price is below maximum: 1000000000 <= 2000000000');
    });

    it('should not match when alert has price filters but activity has no price', () => {
      baseAlert.minPriceDrops = '500000000';
      delete baseActivity.priceDrops;

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result).toEqual({
        alertConfigId: 'alert-1',
        matched: false,
        reasons: ['Alert has price filters but activity has no price information'],
      });
    });
  });

  describe('evaluateAlertMatch - Trait Filtering', () => {
    let baseActivity: NFTActivity;
    let baseAlert: AlertConfigEntity;

    beforeEach(() => {
      baseActivity = {
        id: 'activity-1',
        nftId: 'nft-1',
        transactionHash: 'tx-hash-123',
        ledgerIndex: 75000000,
        activityType: 'sale',
        timestamp: new Date(),
        nft: {
          id: 'nft-1',
          nftId: 'nft-token-123',
          ownerAddress: 'rTestAccount123',
          traits: {
            rarity: 'legendary',
            color: 'blue',
            level: 85,
          },
        },
      };

      baseAlert = {
        id: 'alert-1',
        activityTypes: ['sale'],
        isActive: true,
      } as AlertConfigEntity;
    });

    it('should match when trait equals filter value', () => {
      baseAlert.traitFilters = [
        {
          traitType: 'rarity',
          operator: 'equals',
          value: 'legendary',
        },
      ] as TraitFilter[];

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result.matched).toBe(true);
      expect(result.reasons).toContain('Trait rarity equals legendary');
    });

    it('should not match when trait does not equal filter value', () => {
      baseAlert.traitFilters = [
        {
          traitType: 'rarity',
          operator: 'equals',
          value: 'common',
        },
      ] as TraitFilter[];

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result).toEqual({
        alertConfigId: 'alert-1',
        matched: false,
        reasons: ['Trait rarity (legendary) does not equal common'],
      });
    });

    it('should match when numeric trait is greater than filter', () => {
      baseAlert.traitFilters = [
        {
          traitType: 'level',
          operator: 'greater_than',
          value: '50',
        },
      ] as TraitFilter[];

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result.matched).toBe(true);
      expect(result.reasons).toContain('Trait level (85) > 50');
    });

    it('should not match when numeric trait is not greater than filter', () => {
      baseAlert.traitFilters = [
        {
          traitType: 'level',
          operator: 'greater_than',
          value: '100',
        },
      ] as TraitFilter[];

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result).toEqual({
        alertConfigId: 'alert-1',
        matched: false,
        reasons: ['Trait level (85) is not > 100'],
      });
    });

    it('should match when string trait contains filter value', () => {
      baseAlert.traitFilters = [
        {
          traitType: 'color',
          operator: 'contains',
          value: 'blu',
        },
      ] as TraitFilter[];

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result.matched).toBe(true);
      expect(result.reasons).toContain('Trait color contains "blu"');
    });

    it('should not match when NFT has no trait information', () => {
      baseAlert.traitFilters = [
        {
          traitType: 'rarity',
          operator: 'equals',
          value: 'legendary',
        },
      ] as TraitFilter[];
      baseActivity.nft!.traits = undefined;

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result).toEqual({
        alertConfigId: 'alert-1',
        matched: false,
        reasons: ['Alert has trait filters but NFT has no trait information'],
      });
    });

    it('should not match when NFT does not have the specified trait', () => {
      baseAlert.traitFilters = [
        {
          traitType: 'non_existent_trait',
          operator: 'equals',
          value: 'value',
        },
      ] as TraitFilter[];

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result).toEqual({
        alertConfigId: 'alert-1',
        matched: false,
        reasons: ['NFT does not have trait: non_existent_trait'],
      });
    });

    it('should match multiple trait filters when all pass', () => {
      baseAlert.traitFilters = [
        {
          traitType: 'rarity',
          operator: 'equals',
          value: 'legendary',
        },
        {
          traitType: 'level',
          operator: 'greater_than',
          value: '50',
        },
      ] as TraitFilter[];

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result.matched).toBe(true);
      expect(result.reasons).toContain('Trait rarity equals legendary');
      expect(result.reasons).toContain('Trait level (85) > 50');
    });

    it('should not match when one of multiple trait filters fails', () => {
      baseAlert.traitFilters = [
        {
          traitType: 'rarity',
          operator: 'equals',
          value: 'legendary',
        },
        {
          traitType: 'level',
          operator: 'greater_than',
          value: '100',
        },
      ] as TraitFilter[];

      const result = service['evaluateAlertMatch'](baseAlert, baseActivity);

      expect(result).toEqual({
        alertConfigId: 'alert-1',
        matched: false,
        reasons: ['Trait level (85) is not > 100'],
      });
    });
  });

  describe('findTraitValue', () => {
    it('should find trait value in array format', () => {
      const traits = [
        { trait_type: 'Color', value: 'Blue' },
        { trait_type: 'Rarity', value: 'Legendary' },
      ];

      const result = service['findTraitValue'](traits, 'Color');
      expect(result).toBe('Blue');
    });

    it('should find trait value in object format', () => {
      const traits = {
        color: 'Blue',
        rarity: 'Legendary',
      };

      const result = service['findTraitValue'](traits, 'color');
      expect(result).toBe('Blue');
    });

    it('should return undefined for non-existent trait', () => {
      const traits = { color: 'Blue' };

      const result = service['findTraitValue'](traits, 'rarity');
      expect(result).toBeUndefined();
    });

    it('should handle different trait key formats in arrays', () => {
      const traits = [
        { type: 'Color', value: 'Blue' },
        { name: 'Size', value: 'Large' },
      ];

      expect(service['findTraitValue'](traits, 'Color')).toBe('Blue');
      expect(service['findTraitValue'](traits, 'Size')).toBe('Large');
    });
  });

  describe('evaluateTraitFilter', () => {
    it('should handle not_equals operator', () => {
      const filter: TraitFilter = {
        traitType: 'rarity',
        operator: 'not_equals',
        value: 'common',
      };

      const result = service['evaluateTraitFilter'](filter, 'legendary');
      expect(result).toEqual({
        matched: true,
        reasons: ['Trait rarity does not equal common'],
      });
    });

    it('should handle less_than operator for numeric values', () => {
      const filter: TraitFilter = {
        traitType: 'level',
        operator: 'less_than',
        value: '100',
      };

      const result = service['evaluateTraitFilter'](filter, '50');
      expect(result).toEqual({
        matched: true,
        reasons: ['Trait level (50) < 100'],
      });
    });

    it('should reject non-numeric values for numeric operators', () => {
      const filter: TraitFilter = {
        traitType: 'color',
        operator: 'greater_than',
        value: 'blue',
      };

      const result = service['evaluateTraitFilter'](filter, 'red');
      expect(result).toEqual({
        matched: false,
        reasons: ['Cannot compare non-numeric values: red > blue'],
      });
    });

    it('should handle unknown operators', () => {
      const filter: TraitFilter = {
        traitType: 'test',
        operator: 'unknown_operator' as any,
        value: 'value',
      };

      const result = service['evaluateTraitFilter'](filter, 'test_value');
      expect(result).toEqual({
        matched: false,
        reasons: ['Unknown operator: unknown_operator'],
      });
    });

    it('should handle contains operator case-insensitively', () => {
      const filter: TraitFilter = {
        traitType: 'description',
        operator: 'contains',
        value: 'RARE',
      };

      const result = service['evaluateTraitFilter'](filter, 'This is a rare item');
      expect(result).toEqual({
        matched: true,
        reasons: ['Trait description contains "RARE"'],
      });
    });
  });

  describe('complex scenarios', () => {
    it('should handle activity with all filter types combined', async () => {
      const complexActivity: NFTActivity = {
        id: 'complex-activity',
        nftId: 'nft-1',
        transactionHash: 'tx-hash-123',
        ledgerIndex: 75000000,
        activityType: 'sale',
        priceDrops: '1500000000', // 1500 XRP
        currency: 'XRP',
        timestamp: new Date(),
        nft: {
          id: 'nft-1',
          nftId: 'nft-token-123',
          collectionId: 'premium-collection',
          ownerAddress: 'rTestAccount123',
          traits: {
            rarity: 'legendary',
            level: 95,
            background: 'holographic',
          },
        },
      };

      const complexAlert = {
        id: 'complex-alert',
        userId: 'user123',
        name: 'Complex Alert',
        activityTypes: ['sale'],
        collectionId: 'premium-collection',
        minPriceDrops: '1000000000', // 1000 XRP
        maxPriceDrops: '2000000000', // 2000 XRP
        traitFilters: [
          {
            traitType: 'rarity',
            operator: 'equals',
            value: 'legendary',
          },
          {
            traitType: 'level',
            operator: 'greater_than',
            value: '90',
          },
        ] as TraitFilter[],
        notificationChannels: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {} as any,
        collection: null,
        notifications: [],
      } as AlertConfigEntity;

      mockAlertConfigRepository.findAlertsMatchingActivity.mockResolvedValue([complexAlert]);

      const results = await service.findMatchingAlerts(complexActivity);

      expect(results).toHaveLength(1);
      expect(results[0]?.matched).toBe(true);
      expect(results[0]?.reasons).toEqual([
        'Activity type matches: sale',
        'Collection matches: premium-collection',
        'Price is above minimum: 1500000000 >= 1000000000',
        'Price is below maximum: 1500000000 <= 2000000000',
        'Trait rarity equals legendary',
        'Trait level (95) > 90',
      ]);
    });

    it('should handle empty trait filters array', async () => {
      const activity: NFTActivity = {
        id: 'activity-1',
        nftId: 'nft-1',
        transactionHash: 'tx-hash-123',
        ledgerIndex: 75000000,
        activityType: 'mint',
        timestamp: new Date(),
        nft: {
          id: 'nft-1',
          nftId: 'nft-token-123',
          ownerAddress: 'rTestAccount123',
        },
      };

      const alert = {
        id: 'alert-1',
        userId: 'user123',
        name: 'Mint Alert',
        activityTypes: ['mint'],
        collectionId: null,
        minPriceDrops: null,
        maxPriceDrops: null,
        traitFilters: [], // Empty array
        notificationChannels: [],
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {} as any,
        collection: null,
        notifications: [],
      } as AlertConfigEntity;

      mockAlertConfigRepository.findAlertsMatchingActivity.mockResolvedValue([alert]);

      const results = await service.findMatchingAlerts(activity);

      expect(results[0]?.matched).toBe(true);
    });
  });

  describe('getAlertMatchingStats', () => {
    it('should return default stats (placeholder implementation)', async () => {
      const stats = await service.getAlertMatchingStats('alert-1');

      expect(stats).toEqual({
        totalActivities: 0,
        matchedActivities: 0,
        matchingRate: 0,
      });
    });
  });
});