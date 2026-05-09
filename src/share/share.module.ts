import { Module } from '@nestjs/common';
import { ShareService } from './share.service';
import { ShareController } from './share.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LogModule } from '../log/log.module';
import { DownloadModule } from '../download/download.module';

@Module({
  imports: [PrismaModule, LogModule, DownloadModule],
  controllers: [ShareController],
  providers: [ShareService],
  exports: [ShareService],
})
export class ShareModule {}
