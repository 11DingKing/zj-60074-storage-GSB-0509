import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('存储空间')
@Controller('storage')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('stats')
  @ApiOperation({ summary: '获取空间使用统计', description: '获取当前用户的存储空间使用情况统计' })
  @ApiResponse({ status: 200, description: '返回空间使用统计' })
  async getStorageStats(@CurrentUser() user: any) {
    return this.storageService.getStorageStats(user.id);
  }

  @Put('quota')
  @ApiOperation({ summary: '更新存储配额', description: '更新用户的存储配额（仅管理员可用）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: { type: 'string' },
        newQuota: { type: 'number', description: '新的存储配额（字节）' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '配额更新成功' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  async updateStorageQuota(
    @CurrentUser() user: any,
    @Body('userId') userId: string,
    @Body('newQuota') newQuota: number,
  ) {
    if (!user.isAdmin) {
      return { message: '只有管理员可以更新存储配额' };
    }
    return this.storageService.updateStorageQuota(userId, newQuota);
  }
}
