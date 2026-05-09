import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class RecycleBinService {
  private uploadDir: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', 'uploads');
  }

  async getRecycleBinItems(
    userId: string,
    page: number = 1,
    pageSize: number = 20,
  ) {
    const [items, total] = await Promise.all([
      this.prisma.recycleBin.findMany({
        where: { userId },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { deletedAt: 'desc' },
      }),
      this.prisma.recycleBin.count({ where: { userId } }),
    ]);

    return {
      data: items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async restoreItem(userId: string, itemId: string) {
    const item = await this.prisma.recycleBin.findUnique({
      where: { id: itemId, userId },
    });

    if (!item) {
      throw new NotFoundException('回收站项目不存在');
    }

    if (item.itemType === 'file') {
      const file = await this.prisma.file.findUnique({
        where: { id: item.itemId },
      });

      if (file) {
        await this.prisma.$transaction(async (prisma) => {
          await prisma.recycleBin.delete({ where: { id: itemId } });
          
          await prisma.user.update({
            where: { id: userId },
            data: { storageUsed: { increment: item.itemSize } },
          });
        });

        return { message: '文件已恢复', item };
      } else {
        await this.prisma.recycleBin.delete({ where: { id: itemId } });
        throw new NotFoundException('文件已不存在，无法恢复');
      }
    } else if (item.itemType === 'folder') {
      await this.prisma.recycleBin.delete({ where: { id: itemId } });
      return { message: '文件夹已恢复（注意：文件夹及其内容需要重新创建）', item };
    }

    throw new NotFoundException('不支持的项目类型');
  }

  async permanentDelete(userId: string, itemId: string) {
    const item = await this.prisma.recycleBin.findUnique({
      where: { id: itemId, userId },
    });

    if (!item) {
      throw new NotFoundException('回收站项目不存在');
    }

    if (item.itemType === 'file') {
      const file = await this.prisma.file.findUnique({
        where: { id: item.itemId },
      });

      if (file) {
        await this.prisma.$transaction(async (prisma) => {
          const updatedFile = await prisma.file.update({
            where: { id: item.itemId },
            data: { referenceCount: { decrement: 1 } },
          });

          if (updatedFile.referenceCount <= 0) {
            await prisma.file.delete({ where: { id: item.itemId } });
            
            const userUploadDir = path.join(this.uploadDir, userId);
            if (fs.existsSync(userUploadDir)) {
              const files = fs.readdirSync(userUploadDir);
              for (const f of files) {
                const filePath = path.join(userUploadDir, f);
                const stat = fs.statSync(filePath);
                if (stat.isFile() && BigInt(stat.size) === file.size) {
                  try {
                    fs.unlinkSync(filePath);
                  } catch (e) {
                    console.error('删除物理文件失败:', e);
                  }
                  break;
                }
              }
            }
          }

          await prisma.recycleBin.delete({ where: { id: itemId } });
        });
      } else {
        await this.prisma.recycleBin.delete({ where: { id: itemId } });
      }
    } else {
      await this.prisma.recycleBin.delete({ where: { id: itemId } });
    }

    return { message: '已永久删除' };
  }

  async emptyRecycleBin(userId: string) {
    const items = await this.prisma.recycleBin.findMany({
      where: { userId },
    });

    for (const item of items) {
      await this.permanentDelete(userId, item.id);
    }

    return { message: '回收站已清空', deletedCount: items.length };
  }

  async cleanExpiredItems() {
    const now = new Date();
    const expiredItems = await this.prisma.recycleBin.findMany({
      where: {
        expireAt: { lte: now },
      },
    });

    for (const item of expiredItems) {
      try {
        if (item.itemType === 'file') {
          const file = await this.prisma.file.findUnique({
            where: { id: item.itemId },
          });

          if (file) {
            const updatedFile = await this.prisma.file.update({
              where: { id: item.itemId },
              data: { referenceCount: { decrement: 1 } },
            });

            if (updatedFile.referenceCount <= 0) {
              await this.prisma.file.delete({ where: { id: item.itemId } });
            }
          }
        }

        await this.prisma.recycleBin.delete({ where: { id: item.id } });
      } catch (e) {
        console.error('清理过期回收站项目失败:', e);
      }
    }

    return { cleanedCount: expiredItems.length };
  }
}
