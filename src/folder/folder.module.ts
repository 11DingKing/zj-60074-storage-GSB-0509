import { Module } from '@nestjs/common';
import { FolderService } from './folder.service';
import { FolderController } from './folder.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LogModule } from '../log/log.module';

@Module({
  imports: [PrismaModule, LogModule],
  controllers: [FolderController],
  providers: [FolderService],
  exports: [FolderService],
})
export class FolderModule {}
