import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class StorageService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async getStorageStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const storageUsed = Number(user.storageUsed);
    const storageQuota = Number(user.storageQuota);
    const percentageUsed = (storageUsed / storageQuota) * 100;

    const [fileCount, folderCount] = await Promise.all([
      this.prisma.file.count({ where: { userId } }),
      this.prisma.folder.count({ where: { userId } }),
    ]);

    const mimeTypeStats = await this.prisma.file.groupBy({
      by: ['mimeType'],
      where: { userId },
      _count: {
        id: true,
      },
      _sum: {
        size: true,
      },
    });

    const typeStats = mimeTypeStats.map(stat => ({
      mimeType: stat.mimeType,
      count: stat._count.id,
      size: Number(stat._sum.size || 0),
    }));

    return {
      storageUsed,
      storageQuota,
      percentageUsed: parseFloat(percentageUsed.toFixed(2)),
      available: storageQuota - storageUsed,
      fileCount,
      folderCount,
      typeStats,
    };
  }

  async updateStorageQuota(userId: string, newQuota: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        storageQuota: BigInt(newQuota),
      },
      select: {
        id: true,
        username: true,
        storageQuota: true,
        storageUsed: true,
      },
    });
  }

  async checkStorageAvailable(userId: string, requiredSize: number): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user.storageUsed + BigInt(requiredSize) <= user.storageQuota;
  }
}
