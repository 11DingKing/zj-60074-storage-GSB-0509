import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min } from 'class-validator';

export class InitChunkUploadDto {
  @ApiProperty({ description: '文件名' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: '文件总大小（字节）' })
  @IsInt()
  @Min(1)
  totalSize: number;

  @ApiProperty({ description: '总分片数' })
  @IsInt()
  @Min(1)
  totalChunks: number;

  @ApiProperty({ description: '文件 MD5' })
  @IsString()
  md5: string;

  @ApiProperty({ description: '文件夹 ID（可选）', required: false })
  folderId?: string;
}
