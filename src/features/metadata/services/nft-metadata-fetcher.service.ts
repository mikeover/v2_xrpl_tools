import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import { LoggerService } from '../../../core/logger/logger.service';
import { AppConfiguration } from '../../../shared/config/configuration';
import {
  NFTMetadata,
  MetadataFetchResult,
  CachedMetadata,
} from '../interfaces/nft-metadata.interface';

@Injectable()
export class NFTMetadataFetcherService {
  private s3Client: S3Client | null = null;
  private readonly s3BucketName: string;
  private readonly metadataCachePrefix = 'nft-metadata/';
  private readonly ipfsGateways = [
    'https://ipfs.io/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
  ];

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService<AppConfiguration>,
  ) {
    const awsConfig = this.configService.get('aws', { infer: true });
    this.s3BucketName = awsConfig?.s3BucketName || 'xrpl-nft-monitor';

    // Only initialize S3 client if credentials are provided
    if (awsConfig?.accessKeyId && awsConfig?.secretAccessKey) {
      this.s3Client = new S3Client({
        region: awsConfig?.region || 'us-east-1',
        credentials: {
          accessKeyId: awsConfig.accessKeyId,
          secretAccessKey: awsConfig.secretAccessKey,
        },
      });
      this.logger.log(`NFT Metadata Fetcher initialized with S3 (bucket: ${this.s3BucketName}) and IPFS gateway support`);
    } else {
      this.logger.warn(`AWS S3 credentials not configured - image caching disabled. AccessKeyId present: ${!!awsConfig?.accessKeyId}, SecretKey present: ${!!awsConfig?.secretAccessKey}`);
      this.logger.log('NFT Metadata Fetcher initialized with IPFS gateway support (no S3)');
    }
  }

  async fetchNFTMetadata(nftTokenId: string, uri: string): Promise<MetadataFetchResult> {
    try {
      // Check if metadata is cached in S3 first
      // NFT metadata is immutable, so we cache it forever
      const cached = await this.getCachedMetadata(nftTokenId);
      if (cached) {
        this.logger.debug(`Using cached metadata for NFT ${nftTokenId}`);
        return {
          metadata: cached.metadata,
          cached: true,
          source: 'cache',
          fetchedAt: cached.lastAccessed,
        };
      }

      // Parse the URI to determine fetch method
      const metadata = await this.fetchMetadataFromUri(uri);
      
      if (metadata) {
        // Cache the metadata in S3
        await this.cacheMetadata(nftTokenId, uri, metadata);
        
        // Fetch and cache the image if present
        if (metadata.image) {
          await this.fetchAndCacheImage(nftTokenId, metadata.image);
        }
        
        this.logger.log(`Successfully fetched and cached metadata for NFT ${nftTokenId}`);
        return {
          metadata,
          cached: false,
          source: this.getUriSource(uri),
          fetchedAt: new Date(),
        };
      }

      return {
        metadata: null,
        cached: false,
        source: 'error',
        error: 'Failed to fetch metadata',
        fetchedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(
        `Error fetching metadata for NFT ${nftTokenId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return {
        metadata: null,
        cached: false,
        source: 'error',
        error: error instanceof Error ? error.message : String(error),
        fetchedAt: new Date(),
      };
    }
  }

  private async fetchMetadataFromUri(uri: string): Promise<NFTMetadata | null> {
    if (!uri) {
      return null;
    }

    // Decode URI if it's hex-encoded (common in XRPL)
    const decodedUri = this.decodeXRPLUri(uri);
    
    this.logger.debug(`Fetching metadata from URI: ${decodedUri}`);

    if (decodedUri.startsWith('ipfs://')) {
      return this.fetchFromIPFS(decodedUri);
    } else if (decodedUri.startsWith('http://') || decodedUri.startsWith('https://')) {
      return this.fetchFromHTTP(decodedUri);
    } else {
      this.logger.warn(`Unsupported URI scheme: ${decodedUri}`);
      return null;
    }
  }

  private async fetchFromIPFS(ipfsUri: string): Promise<NFTMetadata | null> {
    try {
      // Extract IPFS hash from URI (ipfs://QmHash or ipfs://QmHash/path)
      const hash = ipfsUri.replace('ipfs://', '');
      
      this.logger.debug(`Fetching from IPFS: ${hash}`);

      // Try multiple IPFS gateways
      for (const gateway of this.ipfsGateways) {
        try {
          const url = `${gateway}${hash}`;
          this.logger.debug(`Trying IPFS gateway: ${url}`);
          
          const response = await axios.get(url, {
            timeout: 15000,
            headers: {
              'User-Agent': 'XRPL-NFT-Monitor/1.0',
            },
          });

          const metadata = this.validateAndNormalizeMetadata(response.data);
          if (metadata) {
            this.logger.debug(`Successfully fetched from IPFS gateway: ${gateway}`);
            return metadata;
          }
        } catch (error) {
          this.logger.debug(`IPFS gateway ${gateway} failed: ${error instanceof Error ? error.message : String(error)}`);
          continue; // Try next gateway
        }
      }

      this.logger.error(`All IPFS gateways failed for hash: ${hash}`);
      return null;
    } catch (error) {
      this.logger.error(`Failed to fetch from IPFS: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async fetchFromHTTP(httpUri: string): Promise<NFTMetadata | null> {
    try {
      this.logger.debug(`Fetching from HTTP: ${httpUri}`);
      
      const response = await axios.get(httpUri, {
        timeout: 10000,
        headers: {
          'User-Agent': 'XRPL-NFT-Monitor/1.0',
        },
      });

      return this.validateAndNormalizeMetadata(response.data);
    } catch (error) {
      this.logger.error(`Failed to fetch from HTTP: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private validateAndNormalizeMetadata(rawMetadata: any): NFTMetadata | null {
    if (!rawMetadata || typeof rawMetadata !== 'object') {
      return null;
    }

    // Normalize the metadata to our standard format
    const metadata: NFTMetadata = {
      name: rawMetadata.name || rawMetadata.title,
      description: rawMetadata.description,
      image: rawMetadata.image || rawMetadata.image_url,
      external_url: rawMetadata.external_url || rawMetadata.external_link,
      animation_url: rawMetadata.animation_url,
      youtube_url: rawMetadata.youtube_url,
      attributes: this.normalizeAttributes(rawMetadata.attributes || rawMetadata.traits),
      properties: rawMetadata.properties,
    };

    // Include any other fields
    Object.keys(rawMetadata).forEach((key) => {
      if (!['name', 'title', 'description', 'image', 'image_url', 'external_url', 'external_link', 'animation_url', 'youtube_url', 'attributes', 'traits', 'properties'].includes(key)) {
        metadata[key] = rawMetadata[key];
      }
    });

    return metadata;
  }

  private normalizeAttributes(attributes: any): any[] {
    if (!Array.isArray(attributes)) {
      return [];
    }

    return attributes.map((attr) => ({
      trait_type: attr.trait_type || attr.type || attr.name,
      value: attr.value,
      display_type: attr.display_type,
    })).filter((attr) => attr.trait_type && attr.value !== undefined);
  }

  private decodeXRPLUri(uri: string): string {
    try {
      // XRPL URIs are often hex-encoded
      if (uri.match(/^[0-9A-Fa-f]+$/)) {
        return Buffer.from(uri, 'hex').toString('utf8');
      }
      return uri;
    } catch (error) {
      this.logger.warn(`Failed to decode URI: ${uri}`);
      return uri;
    }
  }

  private async getCachedMetadata(nftTokenId: string): Promise<CachedMetadata | null> {
    if (!this.s3Client) {
      return null;
    }

    try {
      const s3Key = `${this.metadataCachePrefix}${nftTokenId}.json`;
      const command = new GetObjectCommand({
        Bucket: this.s3BucketName,
        Key: s3Key,
      });

      const response = await this.s3Client.send(command);
      if (response.Body) {
        const data = await response.Body.transformToString();
        const cached: CachedMetadata = JSON.parse(data);
        
        // Update last accessed time
        cached.lastAccessed = new Date();
        await this.updateCacheAccess(cached);
        
        return cached;
      }
    } catch (error) {
      if ((error as any).name !== 'NoSuchKey') {
        this.logger.error(`Error reading cached metadata: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return null;
  }

  private async cacheMetadata(nftTokenId: string, originalUri: string, metadata: NFTMetadata): Promise<void> {
    if (!this.s3Client) {
      return;
    }

    try {
      const s3Key = `${this.metadataCachePrefix}${nftTokenId}.json`;
      // NFT metadata is immutable, so we cache forever without expiration
      const cached: CachedMetadata = {
        nftTokenId,
        metadata,
        originalUri,
        s3Key,
        cachedAt: new Date(),
        lastAccessed: new Date(),
      };

      const command = new PutObjectCommand({
        Bucket: this.s3BucketName,
        Key: s3Key,
        Body: JSON.stringify(cached),
        ContentType: 'application/json',
        Metadata: {
          nftTokenId,
          cachedAt: cached.cachedAt.toISOString(),
        },
      });

      await this.s3Client.send(command);
      this.logger.debug(`Cached metadata for NFT ${nftTokenId} in S3`);
    } catch (error) {
      this.logger.error(`Failed to cache metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async updateCacheAccess(cached: CachedMetadata): Promise<void> {
    if (!this.s3Client) {
      return;
    }

    try {
      const command = new PutObjectCommand({
        Bucket: this.s3BucketName,
        Key: cached.s3Key,
        Body: JSON.stringify(cached),
        ContentType: 'application/json',
        Metadata: {
          nftTokenId: cached.nftTokenId,
          cachedAt: cached.cachedAt.toISOString(),
          lastAccessed: cached.lastAccessed.toISOString(),
        },
      });

      await this.s3Client.send(command);
    } catch (error) {
      this.logger.error(`Failed to update cache access: ${error instanceof Error ? error.message : String(error)}`);
    }
  }


  private getUriSource(uri: string): 'ipfs' | 'http' {
    if (uri.startsWith('ipfs://')) {
      return 'ipfs';
    } else if (uri.startsWith('http://') || uri.startsWith('https://')) {
      return 'http';
    }
    return 'http'; // default
  }

  async fetchAndCacheImage(nftTokenId: string, imageUrl: string): Promise<string | null> {
    try {
      this.logger.debug(`Starting fetchAndCacheImage for NFT ${nftTokenId} with URL: ${imageUrl}`);
      
      // Skip if S3 is not configured
      if (!this.s3Client) {
        this.logger.warn(`S3 client not initialized - skipping image cache for NFT ${nftTokenId}`);
        return null;
      }

      // Check if image is already cached
      const cachedUrl = await this.getCachedImageUrl(nftTokenId);
      if (cachedUrl) {
        this.logger.debug(`Image already cached for NFT ${nftTokenId}`);
        return cachedUrl;
      }

      // Handle different URL types
      let decodedUrl: string;
      if (imageUrl.startsWith('ipfs://')) {
        decodedUrl = this.convertIpfsToHttp(imageUrl);
      } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        decodedUrl = imageUrl;
      } else {
        // Handle relative URLs or other formats
        this.logger.warn(`Unexpected image URL format: ${imageUrl}`);
        decodedUrl = imageUrl;
      }

      this.logger.debug(`Fetching image for NFT ${nftTokenId} from ${decodedUrl}`);

      // Fetch the image with retry logic for IPFS gateways
      let response;
      let lastError;

      if (imageUrl.startsWith('ipfs://')) {
        // Try multiple gateways for IPFS
        for (const gateway of this.ipfsGateways) {
          try {
            const ipfsUrl = `${gateway}${imageUrl.replace('ipfs://', '')}`;
            this.logger.debug(`Trying IPFS gateway for image: ${ipfsUrl}`);
            
            response = await axios.get(ipfsUrl, {
              responseType: 'arraybuffer',
              timeout: 30000,
              maxContentLength: 50 * 1024 * 1024, // 50MB max
              headers: {
                'User-Agent': 'XRPL-NFT-Monitor/1.0',
              },
            });
            break; // Success, exit loop
          } catch (error) {
            lastError = error;
            this.logger.debug(`IPFS gateway failed: ${error instanceof Error ? error.message : String(error)}`);
            continue;
          }
        }
      } else {
        // Direct fetch for HTTP/HTTPS URLs
        try {
          response = await axios.get(decodedUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxContentLength: 50 * 1024 * 1024, // 50MB max
            headers: {
              'User-Agent': 'XRPL-NFT-Monitor/1.0',
              'Accept': 'image/*',
            },
          });
        } catch (error) {
          lastError = error;
          this.logger.error(`Failed to fetch image from ${decodedUrl}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (!response) {
        throw lastError || new Error('Failed to fetch image');
      }

      // Validate content type
      const contentType = response.headers['content-type'];
      // Handle non-standard content types like 'jpg' instead of 'image/jpeg'
      const normalizedContentType = this.normalizeContentType(contentType);
      if (!normalizedContentType) {
        throw new Error(`Invalid content type: ${contentType}`);
      }

      // Determine file extension
      const extension = this.getImageExtension(normalizedContentType);
      const s3Key = `${this.metadataCachePrefix}images/${nftTokenId}${extension}`;

      // Upload to S3
      const command = new PutObjectCommand({
        Bucket: this.s3BucketName,
        Key: s3Key,
        Body: Buffer.from(response.data),
        ContentType: normalizedContentType,
        Metadata: {
          nftTokenId,
          originalUrl: imageUrl,
          cachedAt: new Date().toISOString(),
        },
      });

      this.logger.debug(`Uploading image to S3: bucket=${this.s3BucketName}, key=${s3Key}`);
      await this.s3Client.send(command);
      
      const s3Url = `https://${this.s3BucketName}.s3.amazonaws.com/${s3Key}`;
      this.logger.log(`Successfully cached image for NFT ${nftTokenId} at ${s3Url}`);
      
      return s3Url;
    } catch (error) {
      this.logger.error(
        `Failed to fetch/cache image for NFT ${nftTokenId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (error instanceof Error && error.stack) {
        this.logger.error(`Stack trace: ${error.stack}`);
      }
      return null;
    }
  }

  private async getCachedImageUrl(nftTokenId: string): Promise<string | null> {
    if (!this.s3Client) {
      return null;
    }

    try {
      // Check common image extensions
      const extensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
      
      for (const ext of extensions) {
        const s3Key = `${this.metadataCachePrefix}images/${nftTokenId}${ext}`;
        
        try {
          const command = new GetObjectCommand({
            Bucket: this.s3BucketName,
            Key: s3Key,
          });
          
          // Just check if it exists
          await this.s3Client.send(command);
          return `https://${this.s3BucketName}.s3.amazonaws.com/${s3Key}`;
        } catch (error) {
          // Continue to next extension
          continue;
        }
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Error checking cached image: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private convertIpfsToHttp(ipfsUrl: string): string {
    const hash = ipfsUrl.replace('ipfs://', '');
    return `${this.ipfsGateways[0]}${hash}`;
  }

  private normalizeContentType(contentType: string | undefined): string | null {
    if (!contentType) {
      return null;
    }

    const ct = contentType.toLowerCase();
    
    // Handle non-standard content types
    const typeMap: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
    };

    // If it's already a proper content type
    if (ct.startsWith('image/')) {
      return ct;
    }

    // Try to map non-standard types
    if (typeMap[ct]) {
      return typeMap[ct];
    }

    // Check if it contains image type info
    for (const [key, value] of Object.entries(typeMap)) {
      if (ct.includes(key)) {
        return value;
      }
    }

    return null;
  }

  private getImageExtension(contentType: string): string {
    const typeMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      'image/svg+xml': '.svg',
    };
    
    return typeMap[contentType.toLowerCase()] || '.jpg';
  }
}