import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  ValidationPipe,
  UsePipes,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { UserService } from '../../users/services/user.service';
import { JwtAuthService } from '../services/jwt.service';
import { LoginDto, RegisterDto, RefreshTokenDto, ChangePasswordDto, UpdateProfileDto } from '../dto/auth.dto';
import { CreateUserDto } from '../../users/interfaces/user.interface';
import { LoggerService } from '../../../core/logger/logger.service';
import { Public } from '../decorators/public.decorator';
import { CurrentUser } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AuthenticatedUser } from '../interfaces/auth.interface';

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly userService: UserService,
    private readonly jwtAuthService: JwtAuthService,
    private readonly logger: LoggerService,
  ) {}

  @Public()
  @Post('register')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async register(@Body() registerDto: RegisterDto) {
    // Validate passwords match
    if (registerDto.password !== registerDto.confirmPassword) {
      throw new UnauthorizedException('Passwords do not match');
    }

    const createUserDto: CreateUserDto = {
      email: registerDto.email,
      password: registerDto.password,
    };
    
    if (registerDto.firstName) {
      createUserDto.firstName = registerDto.firstName;
    }
    if (registerDto.lastName) {
      createUserDto.lastName = registerDto.lastName;
    }

    await this.userService.create(createUserDto);
    
    // Auto-login after registration
    const loginResult = await this.userService.login(registerDto.email, registerDto.password);
    
    return {
      message: 'Registration successful',
      user: loginResult.user,
      tokens: loginResult.tokens,
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async login(@Body() loginDto: LoginDto) {
    const result = await this.userService.login(loginDto.email, loginDto.password);
    
    return {
      message: 'Login successful',
      user: result.user,
      tokens: result.tokens,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    const result = await this.userService.refreshTokens(refreshTokenDto.refreshToken);
    
    return {
      message: 'Tokens refreshed successfully',
      user: result.user,
      tokens: result.tokens,
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout() {
    // In a production system, you would invalidate the refresh token here
    // For now, we'll just return a success message
    // TODO: Implement refresh token blacklisting
    
    this.logger.log('User logged out');
    
    return {
      message: 'Logout successful',
    };
  }

  @Get('profile')
  async getProfile(@CurrentUser() user: AuthenticatedUser) {
    const userProfile = await this.userService.findById(user.id);
    if (!userProfile) {
      throw new UnauthorizedException('User not found');
    }

    return {
      message: 'Profile retrieved successfully',
      user: userProfile,
    };
  }

  @Patch('profile')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const updatedUser = await this.userService.updateProfile(user.id, updateProfileDto);

    return {
      message: 'Profile updated successfully',
      user: updatedUser,
    };
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    await this.userService.changePassword(user.id, changePasswordDto);

    return {
      message: 'Password changed successfully',
    };
  }

  @Post('api-key')
  @HttpCode(HttpStatus.CREATED)
  async generateApiKey(@CurrentUser() user: AuthenticatedUser) {
    const apiKey = await this.jwtAuthService.generateApiKey(user.id);

    this.logger.log(`API key generated for user: ${user.email}`);

    return {
      message: 'API key generated successfully',
      apiKey,
      note: 'Store this API key securely. It will not be shown again.',
    };
  }

  @Public()
  @Post('verify-api-key')
  @HttpCode(HttpStatus.OK)
  async verifyApiKey(@Body('apiKey') apiKey: string) {
    try {
      const result = await this.jwtAuthService.verifyApiKey(apiKey);
      const user = await this.userService.findById(result.userId);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      return {
        message: 'API key is valid',
        userId: result.userId,
        userEmail: user.email,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid API key');
    }
  }
}