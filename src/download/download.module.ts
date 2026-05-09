import { Module } from '@nestjs/common';
import { DownloadService } from './download.service';
import { DownloadController } from './download.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LogModule } from '../log/log.module';

@Module({
  imports: [PrismaModule, LogModule],
  controllers: [DownloadController],
  providers: [DownloadService],
  exports: [DownloadService],
})
export class DownloadModule {}
