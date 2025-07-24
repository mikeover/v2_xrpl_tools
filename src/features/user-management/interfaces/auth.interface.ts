export interface JwtPayload {
  sub: string; // User ID
  email: string;
  roles: UserRole[];
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenId: string;
  iat: number;
  exp: number;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
  expiresIn: number;
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface UserProfile {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  isActive: boolean;
  emailVerified: boolean;
  roles: UserRole[];
  createdAt: Date;
  lastLoginAt: Date | null;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface UpdateUserProfileRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface APIKey {
  id: string;
  name: string;
  keyHash: string; // Hashed version of the API key
  prefix: string; // First 8 characters for identification
  userId: string;
  scopes: string[];
  isActive: boolean;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface CreateAPIKeyRequest {
  name: string;
  scopes: string[];
  expiresInDays?: number;
}

export interface CreateAPIKeyResponse {
  id: string;
  name: string;
  key: string; // Plain text key (only returned once)
  prefix: string;
  scopes: string[];
  expiresAt: Date | null;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  API_USER = 'api_user',
  READONLY = 'readonly',
}

export enum Permission {
  // User management
  CREATE_USER = 'create:user',
  READ_USER = 'read:user',
  UPDATE_USER = 'update:user',
  DELETE_USER = 'delete:user',
  
  // Alert management
  CREATE_ALERT = 'create:alert',
  READ_ALERT = 'read:alert',
  UPDATE_ALERT = 'update:alert',
  DELETE_ALERT = 'delete:alert',
  
  // System management
  READ_SYSTEM = 'read:system',
  MANAGE_SYSTEM = 'manage:system',
  
  // API access
  API_ACCESS = 'api:access',
  WEBHOOK_ACCESS = 'webhook:access',
}

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  [UserRole.ADMIN]: [
    Permission.CREATE_USER,
    Permission.READ_USER,
    Permission.UPDATE_USER,
    Permission.DELETE_USER,
    Permission.CREATE_ALERT,
    Permission.READ_ALERT,
    Permission.UPDATE_ALERT,
    Permission.DELETE_ALERT,
    Permission.READ_SYSTEM,
    Permission.MANAGE_SYSTEM,
    Permission.API_ACCESS,
    Permission.WEBHOOK_ACCESS,
  ],
  [UserRole.USER]: [
    Permission.READ_USER,
    Permission.UPDATE_USER,
    Permission.CREATE_ALERT,
    Permission.READ_ALERT,
    Permission.UPDATE_ALERT,
    Permission.DELETE_ALERT,
    Permission.API_ACCESS,
  ],
  [UserRole.API_USER]: [
    Permission.READ_USER,
    Permission.READ_ALERT,
    Permission.API_ACCESS,
    Permission.WEBHOOK_ACCESS,
  ],
  [UserRole.READONLY]: [
    Permission.READ_USER,
    Permission.READ_ALERT,
    Permission.READ_SYSTEM,
  ],
};