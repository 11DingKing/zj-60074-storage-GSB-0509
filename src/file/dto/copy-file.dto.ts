import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CopyFileDto {
  @ApiProperty({ description: '目标文件夹ID（为空则复制到根目录）', example: 'uuid', required: false })
  @IsString()
  @IsOptional()
  targetFolderId?: string;

  @ApiProperty({ description: '新文件名（可选，不填则使用原文件名）', example: 'copy.jpg', required: false })
  @IsString()
  @IsOptional()
  newName?: string;
}
