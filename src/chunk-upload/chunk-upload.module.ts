import { Module } from '@nestjs/common';
import { ChunkUploadService } from './chunk-upload.service';
import { ChunkUploadController } from './chunk-upload.controller';
import { RedisModule } from '../redis/redis.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [RedisModule, PrismaModule],
  controllers: [ChunkUploadController],
  providers: [ChunkUploadService],
  exports: [ChunkUploadService],
})
export class ChunkUploadModule {}
