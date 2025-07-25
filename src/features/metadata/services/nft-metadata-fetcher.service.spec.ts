import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NFTMetadataFetcherService } from './nft-metadata-fetcher.service';
import { LoggerService } from '../../../core/logger/logger.service';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  GetObjectCommand: jest.fn(),
  PutObjectCommand: jest.fn(),
}));

describe('NFTMetadataFetcherService', () => {
  let service: NFTMetadataFetcherService;
  let mockS3Client: any;

  const mockLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  const mockConfigWithS3 = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'aws') {
        return {
          accessKeyId: 'test-key',
          secretAccessKey: 'test-secret',
          region: 'us-east-1',
          s3BucketName: 'test-bucket',
        };
      }
      return null;
    }),
  };

  const mockConfigWithoutS3 = {
    get: jest.fn().mockImplementation(() => null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  describe('with S3 configuration', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NFTMetadataFetcherService,
          {
            provide: LoggerService,
            useValue: mockLoggerService,
          },
          {
            provide: ConfigService,
            useValue: mockConfigWithS3,
          },
        ],
      }).compile();

      service = module.get<NFTMetadataFetcherService>(NFTMetadataFetcherService);
      mockS3Client = (service as any).s3Client;
    });

    it('should be defined', () => {
      expect(service).toBeDefined();
      expect(mockS3Client).toBeDefined();
    });

    describe('fetchNFTMetadata', () => {
      const nftTokenId = 'NFT123';
      const ipfsUri = 'ipfs://QmTest123';
      const httpUri = 'https://example.com/metadata.json';
      const mockMetadata = {
        name: 'Test NFT',
        description: 'A test NFT',
        image: 'https://example.com/image.png',
        attributes: [
          { trait_type: 'Color', value: 'Blue' },
          { trait_type: 'Rarity', value: 'Common' },
        ],
      };

      it('should fetch metadata from IPFS URI', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: mockMetadata });
        mockS3Client.send.mockResolvedValueOnce({}); // Cache metadata
        mockS3Client.send.mockResolvedValueOnce({}); // Cache image

        const result = await service.fetchNFTMetadata(nftTokenId, ipfsUri);

        expect(result).toEqual({
          metadata: mockMetadata,
          cached: false,
          source: 'ipfs',
          fetchedAt: expect.any(Date),
        });

        expect(mockedAxios.get).toHaveBeenCalledWith(
          expect.stringContaining('QmTest123'),
          expect.objectContaining({
            timeout: 15000,
            headers: {
              'User-Agent': 'XRPL-NFT-Monitor/1.0',
            },
          }),
        );
      });

      it('should fetch metadata from HTTP URI', async () => {
        mockedAxios.get.mockResolvedValueOnce({ data: mockMetadata });
        mockS3Client.send.mockResolvedValueOnce({}); // Cache metadata
        mockS3Client.send.mockResolvedValueOnce({}); // Cache image

        const result = await service.fetchNFTMetadata(nftTokenId, httpUri);

        expect(result).toEqual({
          metadata: mockMetadata,
          cached: false,
          source: 'http',
          fetchedAt: expect.any(Date),
        });

        expect(mockedAxios.get).toHaveBeenCalledWith(httpUri, expect.any(Object));
      });

      it('should return cached metadata if available', async () => {
        const cachedMetadata = {
          nftTokenId,
          metadata: mockMetadata,
          originalUri: ipfsUri,
          s3Key: 'nft-metadata/NFT123.json',
          cachedAt: new Date(),
          lastAccessed: new Date(),
        };

        mockS3Client.send.mockResolvedValueOnce({
          Body: {
            transformToString: jest.fn().mockResolvedValue(JSON.stringify(cachedMetadata)),
          },
        });

        const result = await service.fetchNFTMetadata(nftTokenId, ipfsUri);

        expect(result).toEqual({
          metadata: mockMetadata,
          cached: true,
          source: 'cache',
          fetchedAt: expect.any(Date),
        });

        expect(mockedAxios.get).not.toHaveBeenCalled();
      });

      it('should handle IPFS gateway failures gracefully', async () => {
        mockedAxios.get
          .mockRejectedValueOnce(new Error('Gateway 1 failed'))
          .mockRejectedValueOnce(new Error('Gateway 2 failed'))
          .mockResolvedValueOnce({ data: mockMetadata });

        mockS3Client.send.mockResolvedValue({});

        const result = await service.fetchNFTMetadata(nftTokenId, ipfsUri);

        expect(result.metadata).toEqual(mockMetadata);
        expect(mockedAxios.get).toHaveBeenCalledTimes(3);
      });

      it('should return error when all IPFS gateways fail', async () => {
        mockedAxios.get.mockRejectedValue(new Error('All gateways failed'));

        const result = await service.fetchNFTMetadata(nftTokenId, ipfsUri);

        expect(result).toEqual({
          metadata: null,
          cached: false,
          source: 'error',
          error: 'Failed to fetch metadata',
          fetchedAt: expect.any(Date),
        });
      });

      it('should decode hex-encoded XRPL URIs', async () => {
        const hexUri = Buffer.from(httpUri, 'utf8').toString('hex');
        mockedAxios.get.mockResolvedValueOnce({ data: mockMetadata });
        mockS3Client.send.mockResolvedValue({});

        const result = await service.fetchNFTMetadata(nftTokenId, hexUri);

        expect(result.metadata).toEqual(mockMetadata);
        expect(mockedAxios.get).toHaveBeenCalledWith(httpUri, expect.any(Object));
      });
    });

    describe('validateAndNormalizeMetadata', () => {
      it('should normalize metadata with different field names', () => {
        const rawMetadata = {
          title: 'Test NFT', // Alternative to 'name'
          description: 'A test NFT',
          image_url: 'https://example.com/image.png', // Alternative to 'image'
          external_link: 'https://example.com', // Alternative to 'external_url'
          traits: [ // Alternative to 'attributes'
            { type: 'Color', value: 'Blue' },
          ],
        };

        const result = (service as any).validateAndNormalizeMetadata(rawMetadata);

        expect(result).toEqual({
          name: 'Test NFT',
          description: 'A test NFT',
          image: 'https://example.com/image.png',
          external_url: 'https://example.com',
          attributes: [
            { trait_type: 'Color', value: 'Blue' },
          ],
        });
      });

      it('should handle boolean attribute values', () => {
        const rawMetadata = {
          attributes: [
            { trait_type: 'animated', value: true },
            { trait_type: 'level', value: 5 },
          ],
        };

        const result = (service as any).validateAndNormalizeMetadata(rawMetadata);

        expect(result.attributes).toEqual([
          { trait_type: 'animated', value: 'true' }, // Boolean converted to string
          { trait_type: 'level', value: 5 },
        ]);
      });

      it('should filter out invalid attributes', () => {
        const rawMetadata = {
          attributes: [
            { trait_type: 'valid', value: 'test' },
            { value: 'missing trait_type' }, // Invalid
            { trait_type: 'missing value' }, // Invalid
            { trait_type: 'object', value: { nested: 'value' } }, // Invalid
          ],
        };

        const result = (service as any).validateAndNormalizeMetadata(rawMetadata);

        expect(result.attributes).toEqual([
          { trait_type: 'valid', value: 'test' },
        ]);
      });

      it('should return null for invalid metadata', () => {
        expect((service as any).validateAndNormalizeMetadata(null)).toBeNull();
        expect((service as any).validateAndNormalizeMetadata('string')).toBeNull();
        expect((service as any).validateAndNormalizeMetadata(123)).toBeNull();
      });
    });

    describe('fetchAndCacheImage', () => {
      const nftTokenId = 'NFT123';
      const imageUrl = 'https://example.com/image.png';

      it('should fetch and cache image successfully', async () => {
        const mockImageData = Buffer.from('image data');
        mockedAxios.get.mockResolvedValueOnce({
          data: mockImageData,
          headers: { 'content-type': 'image/png' },
        });

        mockS3Client.send
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .jpg
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .jpeg
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .png
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .gif
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .webp
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .svg
          .mockResolvedValueOnce({}); // Upload image

        const result = await service.fetchAndCacheImage(nftTokenId, imageUrl);

        expect(result).toBe(`https://test-bucket.s3.amazonaws.com/nft-metadata/images/${nftTokenId}.png`);
        expect(mockedAxios.get).toHaveBeenCalledWith(imageUrl, expect.objectContaining({
          responseType: 'arraybuffer',
          timeout: 30000,
          maxContentLength: 50 * 1024 * 1024,
        }));
      });

      it('should return cached image URL if already exists', async () => {
        mockS3Client.send.mockResolvedValueOnce({}); // Found cached image

        const result = await service.fetchAndCacheImage(nftTokenId, imageUrl);

        expect(result).toBe(`https://test-bucket.s3.amazonaws.com/nft-metadata/images/${nftTokenId}.jpg`);
        expect(mockedAxios.get).not.toHaveBeenCalled();
      });

      it('should handle IPFS image URLs', async () => {
        const ipfsImageUrl = 'ipfs://QmImageHash123';
        const mockImageData = Buffer.from('image data');
        
        mockedAxios.get
          .mockRejectedValueOnce(new Error('Gateway 1 failed'))
          .mockResolvedValueOnce({
            data: mockImageData,
            headers: { 'content-type': 'image/jpeg' },
          });

        mockS3Client.send
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .jpg
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .jpeg
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .png
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .gif
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .webp
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .svg
          .mockResolvedValueOnce({});

        const result = await service.fetchAndCacheImage(nftTokenId, ipfsImageUrl);

        expect(result).toBe(`https://test-bucket.s3.amazonaws.com/nft-metadata/images/${nftTokenId}.jpg`);
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      });

      it('should handle non-standard content types', async () => {
        const mockImageData = Buffer.from('image data');
        mockedAxios.get.mockResolvedValueOnce({
          data: mockImageData,
          headers: { 'content-type': 'jpg' }, // Non-standard
        });

        mockS3Client.send
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .jpg
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .jpeg
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .png
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .gif
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .webp
          .mockRejectedValueOnce({ name: 'NoSuchKey' }) // .svg
          .mockResolvedValueOnce({});

        const result = await service.fetchAndCacheImage(nftTokenId, imageUrl);

        expect(result).toBe(`https://test-bucket.s3.amazonaws.com/nft-metadata/images/${nftTokenId}.jpg`);
      });

      it('should return null on fetch error', async () => {
        mockedAxios.get.mockRejectedValue(new Error('Network error'));
        // Mock all extension checks to fail
        mockS3Client.send.mockRejectedValue({ name: 'NoSuchKey' });

        const result = await service.fetchAndCacheImage(nftTokenId, imageUrl);

        expect(result).toBeNull();
        expect(mockLoggerService.error).toHaveBeenCalled();
      });
    });
  });

  describe('without S3 configuration', () => {
    beforeEach(async () => {
      jest.clearAllMocks();
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          NFTMetadataFetcherService,
          {
            provide: LoggerService,
            useValue: mockLoggerService,
          },
          {
            provide: ConfigService,
            useValue: mockConfigWithoutS3,
          },
        ],
      }).compile();

      service = module.get<NFTMetadataFetcherService>(NFTMetadataFetcherService);
    });

    it('should work without S3 client', () => {
      expect(service).toBeDefined();
      expect((service as any).s3Client).toBeNull();
    });

    it('should fetch metadata without caching', async () => {
      const nftTokenId = 'NFT123';
      const uri = 'https://example.com/metadata.json';
      const mockMetadata = {
        name: 'Test NFT',
        description: 'A test NFT',
      };

      mockedAxios.get.mockReset();
      mockedAxios.get.mockResolvedValueOnce({ data: mockMetadata });

      const result = await service.fetchNFTMetadata(nftTokenId, uri);

      expect(result).toEqual({
        metadata: mockMetadata,
        cached: false,
        source: 'http',
        fetchedAt: expect.any(Date),
      });
    });

    it('should skip image caching without S3', async () => {
      const result = await service.fetchAndCacheImage('NFT123', 'https://example.com/image.png');

      expect(result).toBeNull();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('S3 client not initialized'),
      );
    });
  });
});