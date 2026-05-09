import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Request } from 'express';

export enum OperationType {
  UPLOAD = 'upload',
  DOWNLOAD = 'download',
  DELETE = 'delete',
  SHARE = 'share',
  RENAME = 'rename',
  MOVE = 'move',
  COPY = 'copy',
  CREATE_FOLDER = 'create_folder',
  DELETE_FOLDER = 'delete_folder',
  RESTORE = 'restore',
}

@Injectable()
export class LogService {
  constructor(private prisma: PrismaService) {}

  async log(
    userId: string,
    operation: OperationType,
    fileId?: string,
    fileName?: string,
    filePath?: string,
    request?: Request,
  ) {
    const ip = request?.ip || request?.connection?.remoteAddress || '';
    const userAgent = request?.headers['user-agent'] || '';

    return this.prisma.operationLog.create({
      data: {
        operation,
        userId,
        fileId,
        fileName,
        filePath,
        ip,
        userAgent,
      },
    });
  }

  async getUserLogs(
    userId: string,
    page: number = 1,
    pageSize: number = 20,
    operation?: OperationType,
    startDate?: Date,
    endDate?: Date,
  ) {
    const where: any = { userId };

    if (operation) {
      where.operation = operation;
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

    const [logs, total] = await Promise.all([
      this.prisma.operationLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.operationLog.count({ where }),
    ]);

    return {
      data: logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}
