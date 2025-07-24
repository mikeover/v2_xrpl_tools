export interface TokenPayload {
  sub: string; // User ID
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string; // User ID
  type: 'refresh';
  iat?: number;
  exp?: number;
}

export interface JwtTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  password: string;
  confirmPassword: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  firstName?: string;
  lastName?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiKeyDto {
  name: string;
  description?: string;
  scopes?: string[];
}

export interface ApiKeyResponse {
  id: string;
  name: string;
  key: string; // Only returned on creation
  description?: string;
  scopes?: string[];
  createdAt: Date;
  lastUsedAt?: Date;
}