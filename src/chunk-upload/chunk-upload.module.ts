import { Module } from '@nestjs/common';
import { ChunkUploadService } from './chunk-upload.service';
import { ChunkUploadController } from './chunk-upload.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { LogModule } from '../log/log.module';

@Module({
  imports: [PrismaModule, RedisModule, LogModule],
  controllers: [ChunkUploadController],
  providers: [ChunkUploadService],
  exports: [ChunkUploadService],
})
export class ChunkUploadModule {}
