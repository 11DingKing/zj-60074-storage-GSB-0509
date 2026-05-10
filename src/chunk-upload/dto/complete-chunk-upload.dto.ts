import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

export class CompleteChunkUploadDto {
  @ApiProperty({ description: '目标文件夹ID（可选）', required: false, example: 'uuid-folder-id' })
  @IsString()
  @IsOptional()
  folderId?: string;
}
