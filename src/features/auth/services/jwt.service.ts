import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AppConfiguration } from '../../../shared/config/configuration';
import { TokenPayload, JwtTokens, RefreshTokenPayload } from '../interfaces/auth.interface';
import { LoggerService } from '../../../core/logger/logger.service';

@Injectable()
export class JwtAuthService {
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn: string;
  private readonly refreshTokenSecret: string;
  private readonly refreshTokenExpiresIn: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<AppConfiguration>,
    private readonly logger: LoggerService,
  ) {
    this.jwtSecret = this.configService.get('jwt.secret', { infer: true })!;
    this.jwtExpiresIn = this.configService.get('jwt.expiresIn', { infer: true }) || '7d';
    this.refreshTokenSecret = this.configService.get('jwt.refreshTokenSecret', { infer: true }) || this.jwtSecret;
    this.refreshTokenExpiresIn = this.configService.get('jwt.refreshTokenExpiresIn', { infer: true }) || '30d';
  }

  async generateTokens(payload: TokenPayload): Promise<JwtTokens> {
    try {
      const [accessToken, refreshToken] = await Promise.all([
        this.generateAccessToken(payload),
        this.generateRefreshToken(payload),
      ]);

      return {
        accessToken,
        refreshToken,
        expiresIn: this.jwtExpiresIn,
      };
    } catch (error) {
      this.logger.error(`Failed to generate tokens: ${error instanceof Error ? error.message : String(error)}`);
      throw new UnauthorizedException('Failed to generate authentication tokens');
    }
  }

  async generateAccessToken(payload: TokenPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.jwtSecret,
      expiresIn: this.jwtExpiresIn,
    });
  }

  async generateRefreshToken(payload: TokenPayload): Promise<string> {
    const refreshPayload: RefreshTokenPayload = {
      sub: payload.sub,
      type: 'refresh',
    };

    return this.jwtService.signAsync(refreshPayload, {
      secret: this.refreshTokenSecret,
      expiresIn: this.refreshTokenExpiresIn,
    });
  }

  async verifyAccessToken(token: string): Promise<TokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: this.jwtSecret,
      });

      return payload;
    } catch (error) {
      this.logger.error(`Invalid access token: ${error instanceof Error ? error.message : String(error)}`);
      throw new UnauthorizedException('Invalid access token');
    }
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.refreshTokenSecret,
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      return payload;
    } catch (error) {
      this.logger.error(`Invalid refresh token: ${error instanceof Error ? error.message : String(error)}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<JwtTokens> {
    try {
      const payload = await this.verifyRefreshToken(refreshToken);
      
      // Generate new tokens with the user ID from the refresh token
      const newPayload: TokenPayload = {
        sub: payload.sub,
        email: '', // This will need to be fetched from the user service
        role: 'user', // This will need to be fetched from the user service
      };

      return this.generateTokens(newPayload);
    } catch (error) {
      this.logger.error(`Failed to refresh token: ${error instanceof Error ? error.message : String(error)}`);
      throw new UnauthorizedException('Failed to refresh authentication token');
    }
  }

  extractTokenFromHeader(authHeader: string): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }

    return parts[1];
  }

  async generateApiKey(userId: string): Promise<string> {
    const payload = {
      sub: userId,
      type: 'api_key',
      createdAt: new Date().toISOString(),
    };

    // API keys don't expire by default
    return this.jwtService.signAsync(payload, {
      secret: this.jwtSecret,
    });
  }

  async verifyApiKey(apiKey: string): Promise<{ userId: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<any>(apiKey, {
        secret: this.jwtSecret,
      });

      if (payload.type !== 'api_key') {
        throw new UnauthorizedException('Invalid API key');
      }

      return { userId: payload.sub };
    } catch (error) {
      this.logger.error(`Invalid API key: ${error instanceof Error ? error.message : String(error)}`);
      throw new UnauthorizedException('Invalid API key');
    }
  }
}