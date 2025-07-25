import { Test, TestingModule } from '@nestjs/testing';
import { NFTTransactionParserService } from './nft-transaction-parser.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { NFTActivityType } from '../interfaces/transaction.interface';

describe('NFTTransactionParserService', () => {
  let service: NFTTransactionParserService;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NFTTransactionParserService,
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<NFTTransactionParserService>(NFTTransactionParserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isNFTTransaction', () => {
    it('should return true for NFTokenMint transactions', () => {
      const transaction = {
        TransactionType: 'NFTokenMint',
        Account: 'rTest123',
      };

      expect(service.isNFTTransaction(transaction)).toBe(true);
    });

    it('should return true for NFTokenBurn transactions', () => {
      const transaction = {
        TransactionType: 'NFTokenBurn',
        Account: 'rTest123',
        NFTokenID: 'ABC123',
      };

      expect(service.isNFTTransaction(transaction)).toBe(true);
    });

    it('should return true for NFTokenCreateOffer transactions', () => {
      const transaction = {
        TransactionType: 'NFTokenCreateOffer',
        Account: 'rTest123',
        NFTokenID: 'ABC123',
      };

      expect(service.isNFTTransaction(transaction)).toBe(true);
    });

    it('should return true for NFTokenAcceptOffer transactions', () => {
      const transaction = {
        TransactionType: 'NFTokenAcceptOffer',
        Account: 'rTest123',
      };

      expect(service.isNFTTransaction(transaction)).toBe(true);
    });

    it('should return true for NFTokenCancelOffer transactions', () => {
      const transaction = {
        TransactionType: 'NFTokenCancelOffer',
        Account: 'rTest123',
        NFTokenOffers: ['ABC123'],
      };

      expect(service.isNFTTransaction(transaction)).toBe(true);
    });

    it('should return false for non-NFT transactions', () => {
      const transaction = {
        TransactionType: 'AccountSet', // This is definitely not an NFT transaction
        Account: 'rTest123',
      };

      expect(service.isNFTTransaction(transaction)).toBe(false);
    });

    it('should return false for undefined transaction', () => {
      expect(service.isNFTTransaction(undefined)).toBe(false);
    });

    it('should handle wrapped transactions', () => {
      const wrappedTransaction = {
        tx_json: {
          TransactionType: 'NFTokenMint',
          Account: 'rTest123',
        }
      };

      expect(service.isNFTTransaction(wrappedTransaction)).toBe(true);
    });
  });

  describe('parseNFTTransaction', () => {
    it('should return null for non-NFT transactions', () => {
      const transactionMessage = {
        transaction: {
          TransactionType: 'Payment',
          Account: 'rTest123',
          hash: 'HASH123',
        },
        meta: {},
        ledger_index: 12345,
      };

      const result = service.parseNFTTransaction(transactionMessage);
      expect(result).toBeNull();
    });

    it('should parse NFTokenMint transaction successfully', () => {
      const transactionMessage = {
        transaction: {
          TransactionType: 'NFTokenMint',
          Account: 'rMinter123',
          hash: 'MINT_HASH_123',
          Fee: '12',
          Flags: 0,
          NFTokenTaxon: 12345,
          URI: '68747470733A2F2F6578616D706C652E636F6D2F6E66742E6A736F6E', // hex for https://example.com/nft.json
        },
        meta: {
          TransactionResult: 'tesSUCCESS',
          AffectedNodes: []
        },
        ledger_index: 75000000,
        engine_result: 'tesSUCCESS',
      };

      const result = service.parseNFTTransaction(transactionMessage);

      expect(result).toBeDefined();
      expect(result?.activityType).toBe(NFTActivityType.MINT);
      expect(result?.fromAddress).toBe('rMinter123');
      expect(result?.transactionHash).toBe('MINT_HASH_123');
      expect(result?.ledgerIndex).toBe(75000000);
      expect(result?.timestamp).toBeInstanceOf(Date);
      expect(result?.metadata).toMatchObject({
        transactionType: 'NFTokenMint',
        fee: '12',
        flags: 0,
        engineResult: 'tesSUCCESS',
      });
    });

    it('should parse NFTokenBurn transaction successfully', () => {
      const transactionMessage = {
        transaction: {
          TransactionType: 'NFTokenBurn',
          Account: 'rBurner123',
          hash: 'BURN_HASH_123',
          NFTokenID: 'BURN_TOKEN_123',
          Fee: '12',
        },
        meta: {
          TransactionResult: 'tesSUCCESS',
        },
        ledger_index: 75000001,
        engine_result: 'tesSUCCESS',
      };

      const result = service.parseNFTTransaction(transactionMessage);

      expect(result).toBeDefined();
      expect(result?.activityType).toBe(NFTActivityType.BURN);
      expect(result?.fromAddress).toBe('rBurner123');
      expect(result?.transactionHash).toBe('BURN_HASH_123');
      expect(result?.nftTokenID).toBe('BURN_TOKEN_123');
    });

    it('should handle parsing errors gracefully', () => {
      const invalidMessage = {
        transaction: {
          TransactionType: 'NFTokenMint',
          // Missing required fields that might cause issues
        }
      };

      const result = service.parseNFTTransaction(invalidMessage);
      // Service should handle gracefully and might return null or valid result
      expect(result === null || typeof result === 'object').toBe(true);
    });

    it('should handle malformed transaction data', () => {
      const malformedMessage = null;

      const result = service.parseNFTTransaction(malformedMessage);
      expect(result).toBeNull();
    });

    it('should log debug information for NFT transactions', () => {
      const transaction = {
        TransactionType: 'NFTokenMint',
        Account: 'rTest123',
      };

      service.isNFTTransaction(transaction);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'NFT Transaction Check: NFTokenMint -> ACCEPTED'
      );
    });
  });

  describe('performance', () => {
    it('should handle multiple transaction parsing efficiently', () => {
      const transactions = Array(10).fill(null).map((_, i) => ({
        transaction: {
          TransactionType: 'NFTokenMint',
          Account: `rAccount${i}`,
          hash: `HASH${i}`,
          Fee: '12',
        },
        meta: { TransactionResult: 'tesSUCCESS' },
        ledger_index: 75000000 + i,
        engine_result: 'tesSUCCESS',
      }));

      const startTime = Date.now();
      const results = transactions.map(tx => service.parseNFTTransaction(tx));
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(10);
      expect(results.every(r => r !== null)).toBe(true);
      expect(duration).toBeLessThan(100); // Should be very fast
    });
  });
});