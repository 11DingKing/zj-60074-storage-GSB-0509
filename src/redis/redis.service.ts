import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    
    this.redis = new Redis({
      host,
      port,
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  getClient(): Redis {
    return this.redis;
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.redis.set(key, value, 'EX', ttl);
    } else {
      await this.redis.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  async exists(key: string): Promise<number> {
    return this.redis.exists(key);
  }

  async expire(key: string, ttl: number): Promise<number> {
    return this.redis.expire(key, ttl);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.redis.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.redis.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redis.hgetall(key);
  }

  async hdel(key: string, field: string): Promise<number> {
    return this.redis.hdel(key, field);
  }
}
