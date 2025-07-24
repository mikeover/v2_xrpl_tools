import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../../database/entities/user.entity';

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repository: Repository<UserEntity>,
  ) {}

  async findById(id: string): Promise<UserEntity | null> {
    return this.repository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.repository.findOne({ where: { email: email.toLowerCase() } });
  }

  async create(userData: {
    email: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
  }): Promise<UserEntity> {
    const user = this.repository.create({
      email: userData.email.toLowerCase(),
      passwordHash: userData.passwordHash,
      firstName: userData.firstName || null,
      lastName: userData.lastName || null,
    });

    return this.repository.save(user);
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.repository.update(userId, {
      lastLoginAt: new Date(),
    });
  }

  async updateProfile(
    userId: string,
    updates: {
      firstName?: string;
      lastName?: string;
      emailVerified?: boolean;
    },
  ): Promise<UserEntity | null> {
    await this.repository.update(userId, updates);
    return this.findById(userId);
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.repository.update(userId, { passwordHash });
  }

  async deactivate(userId: string): Promise<void> {
    await this.repository.update(userId, { isActive: false });
  }

  async activate(userId: string): Promise<void> {
    await this.repository.update(userId, { isActive: true });
  }

  async verifyEmail(userId: string): Promise<void> {
    await this.repository.update(userId, { emailVerified: true });
  }

  async count(): Promise<number> {
    return this.repository.count();
  }

  async exists(email: string): Promise<boolean> {
    const count = await this.repository.count({
      where: { email: email.toLowerCase() },
    });
    return count > 0;
  }

  async findAll(options?: {
    skip?: number;
    take?: number;
    isActive?: boolean;
  }): Promise<[UserEntity[], number]> {
    const query = this.repository.createQueryBuilder('user');

    if (options?.isActive !== undefined) {
      query.where('user.isActive = :isActive', { isActive: options.isActive });
    }

    if (options?.skip) {
      query.skip(options.skip);
    }

    if (options?.take) {
      query.take(options.take);
    }

    query.orderBy('user.createdAt', 'DESC');

    return query.getManyAndCount();
  }
}