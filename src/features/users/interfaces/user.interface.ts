import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';

export interface CreateUserDto {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface UpdateUserDto {
  firstName?: string;
  lastName?: string;
}

export interface ChangePasswordDto {
  currentPassword: string;
  newPassword: string;
}

export interface UserResponse {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  emailVerified: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LoginResult {
  user: AuthenticatedUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: string;
  };
}

export interface UserSearchOptions {
  skip?: number;
  take?: number;
  isActive?: boolean;
}

export interface UserServiceInterface {
  create(createUserDto: CreateUserDto): Promise<UserResponse>;
  findById(id: string): Promise<UserResponse | null>;
  findByEmail(email: string): Promise<UserResponse | null>;
  updateProfile(userId: string, updates: UpdateUserDto): Promise<UserResponse>;
  changePassword(userId: string, changePasswordDto: ChangePasswordDto): Promise<void>;
  deactivate(userId: string): Promise<void>;
  activate(userId: string): Promise<void>;
  verifyEmail(userId: string): Promise<void>;
  login(email: string, password: string): Promise<LoginResult>;
  validateUser(email: string, password: string): Promise<AuthenticatedUser | null>;
  toUserResponse(entity: any): UserResponse;
}