import { Injectable, ConflictException, NotFoundException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';
import { PasswordService } from '../../auth/services/password.service';
import { JwtAuthService } from '../../auth/services/jwt.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { UserEntity } from '../../../database/entities/user.entity';
import { AuthenticatedUser, TokenPayload } from '../../auth/interfaces/auth.interface';
import {
  CreateUserDto,
  UpdateUserDto,
  ChangePasswordDto,
  UserResponse,
  LoginResult,
  UserServiceInterface,
} from '../interfaces/user.interface';

@Injectable()
export class UserService implements UserServiceInterface {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordService: PasswordService,
    private readonly jwtAuthService: JwtAuthService,
    private readonly logger: LoggerService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<UserResponse> {
    const { email, password, firstName, lastName } = createUserDto;

    // Check if user already exists
    const existingUser = await this.userRepository.exists(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Validate password strength
    const passwordValidation = this.passwordService.validatePasswordStrength(password);
    if (!passwordValidation.isValid) {
      throw new BadRequestException(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
    }

    // Hash password
    const passwordHash = await this.passwordService.hashPassword(password);

    try {
      // Create user
      const createData: Parameters<typeof this.userRepository.create>[0] = {
        email,
        passwordHash,
      };
      
      if (firstName) {
        createData.firstName = firstName;
      }
      if (lastName) {
        createData.lastName = lastName;
      }

      const user = await this.userRepository.create(createData);

      this.logger.log(`User created successfully: ${user.email}`);
      return this.toUserResponse(user);
    } catch (error) {
      this.logger.error(`Failed to create user: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  async findById(id: string): Promise<UserResponse | null> {
    const user = await this.userRepository.findById(id);
    return user ? this.toUserResponse(user) : null;
  }

  async findByEmail(email: string): Promise<UserResponse | null> {
    const user = await this.userRepository.findByEmail(email);
    return user ? this.toUserResponse(user) : null;
  }

  async updateProfile(userId: string, updates: UpdateUserDto): Promise<UserResponse> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updatedUser = await this.userRepository.updateProfile(userId, updates);
    if (!updatedUser) {
      throw new Error('Failed to update user profile');
    }

    this.logger.log(`User profile updated: ${updatedUser.email}`);
    return this.toUserResponse(updatedUser);
  }

  async changePassword(userId: string, changePasswordDto: ChangePasswordDto): Promise<void> {
    const { currentPassword, newPassword } = changePasswordDto;

    // Get user
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isValid = await this.passwordService.comparePassword(currentPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    // Validate new password
    const passwordValidation = this.passwordService.validatePasswordStrength(newPassword);
    if (!passwordValidation.isValid) {
      throw new BadRequestException(`Password validation failed: ${passwordValidation.errors.join(', ')}`);
    }

    // Hash and update password
    const newPasswordHash = await this.passwordService.hashPassword(newPassword);
    await this.userRepository.updatePassword(userId, newPasswordHash);

    this.logger.log(`Password changed for user: ${user.email}`);
  }

  async deactivate(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.deactivate(userId);
    this.logger.log(`User deactivated: ${user.email}`);
  }

  async activate(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.activate(userId);
    this.logger.log(`User activated: ${user.email}`);
  }

  async verifyEmail(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.verifyEmail(userId);
    this.logger.log(`Email verified for user: ${user.email}`);
  }

  async login(email: string, password: string): Promise<LoginResult> {
    // Validate user credentials
    const authenticatedUser = await this.validateUser(email, password);
    if (!authenticatedUser) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update last login
    await this.userRepository.updateLastLogin(authenticatedUser.id);

    // Generate tokens
    const tokenPayload: TokenPayload = {
      sub: authenticatedUser.id,
      email: authenticatedUser.email,
      role: authenticatedUser.role,
    };

    const tokens = await this.jwtAuthService.generateTokens(tokenPayload);

    this.logger.log(`User logged in: ${authenticatedUser.email}`);

    return {
      user: authenticatedUser,
      tokens,
    };
  }

  async validateUser(email: string, password: string): Promise<AuthenticatedUser | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      return null;
    }

    // Check if user is active
    if (!user.isActive) {
      this.logger.warn(`Inactive user attempted login: ${email}`);
      return null;
    }

    // Verify password
    const isValid = await this.passwordService.comparePassword(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      role: 'user', // Default role for now, can be expanded later
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    if (user.firstName) {
      authenticatedUser.firstName = user.firstName;
    }
    if (user.lastName) {
      authenticatedUser.lastName = user.lastName;
    }

    return authenticatedUser;
  }

  async refreshTokens(refreshToken: string): Promise<LoginResult> {
    try {
      // Verify refresh token
      const payload = await this.jwtAuthService.verifyRefreshToken(refreshToken);
      
      // Get user
      const user = await this.userRepository.findById(payload.sub);
      if (!user || !user.isActive) {
        throw new UnauthorizedException('User not found or inactive');
      }

      // Generate new tokens
      const tokenPayload: TokenPayload = {
        sub: user.id,
        email: user.email,
        role: 'user', // Default role for now
      };

      const tokens = await this.jwtAuthService.generateTokens(tokenPayload);

      const authenticatedUser: AuthenticatedUser = {
        id: user.id,
        email: user.email,
        role: 'user',
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };

      if (user.firstName) {
        authenticatedUser.firstName = user.firstName;
      }
      if (user.lastName) {
        authenticatedUser.lastName = user.lastName;
      }

      return {
        user: authenticatedUser,
        tokens,
      };
    } catch (error) {
      this.logger.error(`Failed to refresh tokens: ${error instanceof Error ? error.message : String(error)}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  toUserResponse(entity: UserEntity): UserResponse {
    const response: UserResponse = {
      id: entity.id,
      email: entity.email,
      isActive: entity.isActive,
      emailVerified: entity.emailVerified,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    };

    if (entity.firstName) {
      response.firstName = entity.firstName;
    }
    if (entity.lastName) {
      response.lastName = entity.lastName;
    }
    if (entity.lastLoginAt) {
      response.lastLoginAt = entity.lastLoginAt;
    }

    return response;
  }

  async getUserStats(): Promise<{
    totalUsers: number;
    activeUsers: number;
    verifiedUsers: number;
  }> {
    const [allUsers] = await this.userRepository.findAll();
    const activeUsers = allUsers.filter(u => u.isActive).length;
    const verifiedUsers = allUsers.filter(u => u.emailVerified).length;

    return {
      totalUsers: allUsers.length,
      activeUsers,
      verifiedUsers,
    };
  }
}