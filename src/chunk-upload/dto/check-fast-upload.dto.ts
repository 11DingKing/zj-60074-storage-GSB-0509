import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CheckFastUploadDto {
  @ApiProperty({ description: '文件 MD5' })
  @IsString()
  md5: string;

  @ApiProperty({ description: '文件名（秒传时需要）', required: false })
  fileName?: string;

  @ApiProperty({ description: '文件夹 ID（可选）', required: false })
  folderId?: string;
}
