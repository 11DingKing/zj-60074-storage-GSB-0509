import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async searchFiles(
    userId: string,
    query?: string,
    fileType?: string,
    minSize?: number,
    maxSize?: number,
    startDate?: Date,
    endDate?: Date,
    page: number = 1,
    pageSize: number = 20,
  ) {
    const where: any = {
      userId,
    };

    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { originalName: { contains: query, mode: 'insensitive' } },
      ];
    }

    if (fileType) {
      const typeFilters = this.getTypeFilter(fileType);
      if (typeFilters.length > 0) {
        where.OR = [
          ...(where.OR || []),
          ...typeFilters.map(filter => ({ mimeType: { startsWith: filter } })),
        ];
      }
    }

    if (minSize !== undefined || maxSize !== undefined) {
      where.size = {};
      if (minSize !== undefined) {
        where.size.gte = BigInt(minSize);
      }
      if (maxSize !== undefined) {
        where.size.lte = BigInt(maxSize);
      }
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = startDate;
      }
      if (endDate) {
        where.createdAt.lte = endDate;
      }
    }

    const [files, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.file.count({ where }),
    ]);

    return {
      data: files,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getFilesByType(
    userId: string,
    fileType: string,
    page: number = 1,
    pageSize: number = 20,
  ) {
    const typeFilters = this.getTypeFilter(fileType);
    
    if (typeFilters.length === 0) {
      return {
        data: [],
        total: 0,
        page,
        pageSize,
        totalPages: 0,
      };
    }

    const where: any = {
      userId,
      OR: typeFilters.map(filter => ({ mimeType: { startsWith: filter } })),
    };

    const [files, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.file.count({ where }),
    ]);

    return {
      data: files,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  private getTypeFilter(fileType: string): string[] {
    const typeMap: Record<string, string[]> = {
      image: ['image/'],
      video: ['video/'],
      audio: ['audio/'],
      document: [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
      ],
      archive: [
        'application/zip',
        'application/vnd.rar',
        'application/x-7z-compressed',
        'application/x-tar',
        'application/gzip',
      ],
    };

    return typeMap[fileType.toLowerCase()] || [];
  }
}
