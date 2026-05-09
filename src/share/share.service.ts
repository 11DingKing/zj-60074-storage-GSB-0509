import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CreateShareLinkDto } from '../download/dto/create-share-link.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ShareService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async createShareLink(userId: string, createShareLinkDto: CreateShareLinkDto) {
    const { fileId, expireHours, maxAccessCount } = createShareLinkDto;

    const file = await this.prisma.file.findUnique({
      where: { id: fileId, userId },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    const defaultExpireHours = this.configService.get<number>('DEFAULT_SHARE_EXPIRE_HOURS', 24);
    const expireAt = new Date();
    expireAt.setHours(expireAt.getHours() + (expireHours || defaultExpireHours));

    const token = uuidv4();

    const shareLink = await this.prisma.shareLink.create({
      data: {
        token,
        fileId,
        userId,
        expireAt,
        maxAccessCount,
      },
      include: {
        file: true,
      },
    });

    return {
      id: shareLink.id,
      token: shareLink.token,
      file: {
        id: shareLink.file.id,
        name: shareLink.file.name,
        originalName: shareLink.file.originalName,
        size: shareLink.file.size,
        mimeType: shareLink.file.mimeType,
      },
      expireAt: shareLink.expireAt,
      maxAccessCount: shareLink.maxAccessCount,
      accessCount: shareLink.accessCount,
      shareUrl: `/api/share/${token}`,
    };
  }

  async getShareLink(token: string) {
    const shareLink = await this.prisma.shareLink.findUnique({
      where: { token },
      include: {
        file: true,
      },
    });

    if (!shareLink) {
      throw new NotFoundException('分享链接不存在');
    }

    if (shareLink.expireAt && new Date() > shareLink.expireAt) {
      throw new ForbiddenException('分享链接已过期');
    }

    if (shareLink.maxAccessCount && shareLink.accessCount >= shareLink.maxAccessCount) {
      throw new ForbiddenException('分享链接已达到最大访问次数');
    }

    return {
      id: shareLink.id,
      token: shareLink.token,
      file: {
        id: shareLink.file.id,
        name: shareLink.file.name,
        originalName: shareLink.file.originalName,
        size: shareLink.file.size,
        mimeType: shareLink.file.mimeType,
      },
      expireAt: shareLink.expireAt,
      maxAccessCount: shareLink.maxAccessCount,
      accessCount: shareLink.accessCount,
    };
  }

  async accessShareLink(token: string) {
    const shareLink = await this.prisma.shareLink.findUnique({
      where: { token },
      include: {
        file: true,
      },
    });

    if (!shareLink) {
      throw new NotFoundException('分享链接不存在');
    }

    if (shareLink.expireAt && new Date() > shareLink.expireAt) {
      throw new ForbiddenException('分享链接已过期');
    }

    if (shareLink.maxAccessCount && shareLink.accessCount >= shareLink.maxAccessCount) {
      throw new ForbiddenException('分享链接已达到最大访问次数');
    }

    await this.prisma.shareLink.update({
      where: { token },
      data: {
        accessCount: { increment: 1 },
      },
    });

    return shareLink.file;
  }

  async getUserShareLinks(userId: string, page: number = 1, pageSize: number = 20) {
    const [shareLinks, total] = await Promise.all([
      this.prisma.shareLink.findMany({
        where: { userId },
        include: {
          file: {
            select: {
              id: true,
              name: true,
              originalName: true,
              size: true,
              mimeType: true,
            },
          },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.shareLink.count({ where: { userId } }),
    ]);

    return {
      data: shareLinks.map(link => ({
        id: link.id,
        token: link.token,
        file: link.file,
        expireAt: link.expireAt,
        maxAccessCount: link.maxAccessCount,
        accessCount: link.accessCount,
        createdAt: link.createdAt,
        shareUrl: `/api/share/${link.token}`,
      })),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async deleteShareLink(userId: string, shareId: string) {
    const shareLink = await this.prisma.shareLink.findUnique({
      where: { id: shareId, userId },
    });

    if (!shareLink) {
      throw new NotFoundException('分享链接不存在');
    }

    await this.prisma.shareLink.delete({
      where: { id: shareId },
    });

    return { message: '分享链接已删除' };
  }
}
