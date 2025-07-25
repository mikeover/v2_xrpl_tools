import { Test, TestingModule } from '@nestjs/testing';
import { NFTTransactionParserService } from './nft-transaction-parser.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { TestDataFactory } from '../../../test/utils/test-data-factory';
import { XRPLTransactionStreamMessage } from '../../../shared/types/xrpl-stream.types';
import { NFTActivityType } from '../interfaces/transaction.interface';
import { Transaction, TransactionMetadata } from 'xrpl';

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
      } as Transaction;

      expect(service.isNFTTransaction(transaction)).toBe(true);
    });

    it('should return true for NFTokenCreateOffer transactions', () => {
      const transaction = {
        TransactionType: 'NFTokenCreateOffer',
        Account: 'rTest123',
        NFTokenID: 'ABC123',
      } as Transaction;

      expect(service.isNFTTransaction(transaction)).toBe(true);
    });

    it('should return true for NFTokenAcceptOffer transactions', () => {
      const transaction = {
        TransactionType: 'NFTokenAcceptOffer',
        Account: 'rTest123',
        NFTokenSellOffer: 'DEF456',
      } as Transaction;

      expect(service.isNFTTransaction(transaction)).toBe(true);
    });

    it('should return true for NFTokenCancelOffer transactions', () => {
      const transaction = {
        TransactionType: 'NFTokenCancelOffer',
        Account: 'rTest123',
        NFTokenOffers: ['GHI789'],
      } as Transaction;

      expect(service.isNFTTransaction(transaction)).toBe(true);
    });

    it('should return true for NFTokenBurn transactions', () => {
      const transaction = {
        TransactionType: 'NFTokenBurn',
        Account: 'rTest123',
        NFTokenID: 'JKL012',
      } as Transaction;

      expect(service.isNFTTransaction(transaction)).toBe(true);
    });

    it('should return false for non-NFT transactions', () => {
      const transaction = {
        TransactionType: 'Payment',
        Account: 'rTest123',
        Destination: 'rTest456',
      } as Transaction;

      expect(service.isNFTTransaction(transaction)).toBe(false);
    });

    it('should return false for undefined transaction', () => {
      expect(service.isNFTTransaction(undefined as any)).toBe(false);
    });
  });

  describe('parseTransaction', () => {
    describe('NFTokenMint transactions', () => {
      it('should parse NFTokenMint transaction correctly', async () => {
        const streamMessage = TestDataFactory.createNFTMintTransaction();
        
        const result = await service.parseTransaction(streamMessage);

        expect(result).toEqual({
          transactionHash: streamMessage.transaction.hash,
          ledgerIndex: streamMessage.ledger_index,
          timestamp: expect.any(Date),
          activityType: NFTActivityType.MINT,
          fromAddress: null,
          toAddress: streamMessage.transaction.Account,
          nftTokenID: expect.any(String),
          priceDrops: null,
          currency: null,
          metadata: {
            transactionType: 'NFTokenMint',
            fee: streamMessage.transaction.Fee,
            flags: streamMessage.transaction.Flags,
            engineResult: streamMessage.engine_result,
            taxon: streamMessage.transaction.NFTokenTaxon,
            transferFee: streamMessage.transaction.TransferFee,
            uri: streamMessage.transaction.URI,
          },
        });
      });

      it('should extract NFTokenID from CreatedNode in metadata', async () => {
        const streamMessage = TestDataFactory.createNFTMintTransaction();
        
        const result = await service.parseTransaction(streamMessage);

        expect(result.nftTokenID).toBeDefined();
        expect(typeof result.nftTokenID).toBe('string');
        expect(result.nftTokenID.length).toBeGreaterThan(0);
      });

      it('should handle NFTokenMint without URI', async () => {
        const streamMessage = TestDataFactory.createNFTMintTransaction({
          transaction: { URI: undefined },
        });
        
        const result = await service.parseTransaction(streamMessage);

        expect(result.metadata.uri).toBeUndefined();
        expect(result.activityType).toBe(NFTActivityType.MINT);
      });
    });

    describe('NFTokenAcceptOffer transactions', () => {
      it('should parse NFTokenAcceptOffer transaction correctly', async () => {
        const streamMessage = TestDataFactory.createNFTSaleTransaction();
        
        const result = await service.parseTransaction(streamMessage);

        expect(result).toEqual({
          transactionHash: streamMessage.transaction.hash,
          ledgerIndex: streamMessage.ledger_index,
          timestamp: expect.any(Date),
          activityType: NFTActivityType.SALE,
          fromAddress: expect.any(String), // Extracted from DeletedNode
          toAddress: streamMessage.transaction.Account,
          nftTokenID: expect.any(String),
          priceDrops: expect.any(String),
          currency: 'XRP',
          metadata: {
            transactionType: 'NFTokenAcceptOffer',
            fee: streamMessage.transaction.Fee,
            flags: streamMessage.transaction.Flags,
            engineResult: streamMessage.engine_result,
            offerSequence: expect.any(Number),
          },
        });
      });

      it('should extract price information from offer', async () => {
        const streamMessage = TestDataFactory.createNFTSaleTransaction();
        
        const result = await service.parseTransaction(streamMessage);

        expect(result.priceDrops).toBeDefined();
        expect(result.currency).toBe('XRP');
        expect(Number(result.priceDrops)).toBeGreaterThan(0);
      });

      it('should handle token currency offers', async () => {
        const streamMessage = TestDataFactory.createNFTSaleTransaction({
          meta: {
            AffectedNodes: [
              {
                DeletedNode: {
                  LedgerEntryType: 'NFTokenOffer',
                  FinalFields: {
                    Amount: {
                      currency: 'USD',
                      value: '100',
                      issuer: 'rTestIssuer123',
                    },
                    NFTokenID: 'ABC123',
                    Account: 'rTestSeller123',
                  },
                },
              },
            ],
          },
        });
        
        const result = await service.parseTransaction(streamMessage);

        expect(result.currency).toBe('USD');
        expect(result.priceDrops).toBe('100');
      });
    });

    describe('NFTokenCreateOffer transactions', () => {
      it('should parse NFTokenCreateOffer transaction correctly', async () => {
        const streamMessage = TestDataFactory.createNFTOfferTransaction();
        
        const result = await service.parseTransaction(streamMessage);

        expect(result).toEqual({
          transactionHash: streamMessage.transaction.hash,
          ledgerIndex: streamMessage.ledger_index,
          timestamp: expect.any(Date),
          activityType: NFTActivityType.OFFER,
          fromAddress: streamMessage.transaction.Account,
          toAddress: null,
          nftTokenID: streamMessage.transaction.NFTokenID,
          priceDrops: streamMessage.transaction.Amount,
          currency: 'XRP',
          metadata: {
            transactionType: 'NFTokenCreateOffer',
            fee: streamMessage.transaction.Fee,
            flags: streamMessage.transaction.Flags,
            engineResult: streamMessage.engine_result,
            offerSequence: expect.any(Number),
          },
        });
      });

      it('should handle buy vs sell offers based on flags', async () => {
        const sellOfferMessage = TestDataFactory.createNFTOfferTransaction({
          transaction: { Flags: 1 }, // Sell offer flag
        });
        
        const result = await service.parseTransaction(sellOfferMessage);

        expect(result.activityType).toBe(NFTActivityType.OFFER);
        expect(result.fromAddress).toBe(sellOfferMessage.transaction.Account);
      });
    });

    describe('NFTokenCancelOffer transactions', () => {
      it('should parse NFTokenCancelOffer transaction correctly', async () => {
        const streamMessage: XRPLTransactionStreamMessage = {
          transaction: {
            TransactionType: 'NFTokenCancelOffer',
            Account: 'rTestAccount123',
            Fee: '12',
            Flags: 0,
            NFTokenOffers: ['OFFER123'],
            hash: 'CANCEL123',
          } as any,
          meta: {
            TransactionResult: 'tesSUCCESS',
            AffectedNodes: [],
          } as TransactionMetadata,
          engine_result: 'tesSUCCESS',
          ledger_index: 75000000,
          validated: true,
        } as any;
        
        const result = await service.parseTransaction(streamMessage);

        expect(result.activityType).toBe(NFTActivityType.CANCEL_OFFER);
        expect(result.fromAddress).toBe(streamMessage.transaction.Account);
        expect(result.toAddress).toBeNull();
      });
    });

    describe('NFTokenBurn transactions', () => {
      it('should parse NFTokenBurn transaction correctly', async () => {
        const streamMessage: XRPLTransactionStreamMessage = {
          transaction: {
            TransactionType: 'NFTokenBurn',
            Account: 'rTestAccount123',
            Fee: '12',
            Flags: 0,
            NFTokenID: 'BURN123',
            hash: 'BURNHASH123',
          } as any,
          meta: {
            TransactionResult: 'tesSUCCESS',
            AffectedNodes: [],
          } as TransactionMetadata,
          engine_result: 'tesSUCCESS',
          ledger_index: 75000000,
          validated: true,
        } as any;
        
        const result = await service.parseTransaction(streamMessage);

        expect(result.activityType).toBe(NFTActivityType.BURN);
        expect(result.fromAddress).toBe(streamMessage.transaction.Account);
        expect(result.toAddress).toBeNull();
        expect(result.nftTokenID).toBe('BURN123');
      });
    });

    describe('error handling', () => {
      it('should handle missing transaction hash', async () => {
        const streamMessage = TestDataFactory.createNFTMintTransaction({
          transaction: { hash: undefined },
        });

        await expect(service.parseTransaction(streamMessage)).rejects.toThrow(
          'Transaction hash is required'
        );
      });

      it('should handle invalid ledger timestamp', async () => {
        const streamMessage = TestDataFactory.createNFTMintTransaction();
        // Override ledger_index to simulate timestamp conversion issue
        streamMessage.ledger_index = -1;

        const result = await service.parseTransaction(streamMessage);
        
        // Should still parse but use current time
        expect(result.timestamp).toBeInstanceOf(Date);
      });

      it('should handle unsupported NFT transaction types', async () => {
        const streamMessage: XRPLTransactionStreamMessage = {
          transaction: {
            TransactionType: 'UnsupportedNFTType' as any,
            Account: 'rTest123',
            hash: 'UNSUPPORTED123',
          } as any,
          meta: {} as TransactionMetadata,
          engine_result: 'tesSUCCESS',
          ledger_index: 75000000,
          validated: true,
        } as any;

        await expect(service.parseTransaction(streamMessage)).rejects.toThrow(
          'Unsupported NFT transaction type: UnsupportedNFTType'
        );
      });

      it('should handle missing metadata for NFTokenMint', async () => {
        const streamMessage = TestDataFactory.createNFTMintTransaction({
          meta: { AffectedNodes: [] },
        });

        await expect(service.parseTransaction(streamMessage)).rejects.toThrow(
          'Could not find NFTokenID in transaction metadata'
        );
      });
    });

    describe('helper methods', () => {
      it('should convert ledger index to timestamp correctly', () => {
        const ledgerIndex = 75000000;
        const result = service['convertLedgerIndexToTimestamp'](ledgerIndex);
        
        expect(result).toBeInstanceOf(Date);
        expect(result.getTime()).toBeGreaterThan(0);
      });

      it('should extract NFTokenID from AffectedNodes', () => {
        const affectedNodes = [
          {
            CreatedNode: {
              LedgerEntryType: 'NFTokenPage',
              NewFields: {
                NFTokens: [
                  {
                    NFToken: {
                      NFTokenID: 'EXTRACTED123',
                    },
                  },
                ],
              },
            },
          },
        ];

        const result = service['extractNFTokenIDFromMetadata'](affectedNodes as any);
        expect(result).toBe('EXTRACTED123');
      });

      it('should return null when NFTokenID not found in metadata', () => {
        const affectedNodes = [
          {
            ModifiedNode: {
              LedgerEntryType: 'AccountRoot',
            },
          },
        ];

        const result = service['extractNFTokenIDFromMetadata'](affectedNodes as any);
        expect(result).toBeNull();
      });
    });
  });

  describe('performance tests', () => {
    it('should parse large batches of transactions efficiently', async () => {
      const transactions = Array(100).fill(null).map(() => 
        TestDataFactory.createNFTMintTransaction()
      );

      const startTime = Date.now();
      
      const results = await Promise.all(
        transactions.map(tx => service.parseTransaction(tx))
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(100);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});