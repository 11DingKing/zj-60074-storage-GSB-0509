import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { FileModule } from './file/file.module';
import { FolderModule } from './folder/folder.module';
import { UploadModule } from './upload/upload.module';
import { DownloadModule } from './download/download.module';
import { StorageModule } from './storage/storage.module';
import { ShareModule } from './share/share.module';
import { RecycleBinModule } from './recycle-bin/recycle-bin.module';
import { LogModule } from './log/log.module';
import { SearchModule } from './search/search.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    FileModule,
    FolderModule,
    UploadModule,
    DownloadModule,
    StorageModule,
    ShareModule,
    RecycleBinModule,
    LogModule,
    SearchModule,
  ],
})
export class AppModule {}
