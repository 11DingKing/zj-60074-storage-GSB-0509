import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class MoveFileDto {
  @ApiProperty({ description: '目标文件夹ID（为空则移动到根目录）', example: 'uuid', required: false })
  @IsString()
  @IsOptional()
  targetFolderId?: string;
}
