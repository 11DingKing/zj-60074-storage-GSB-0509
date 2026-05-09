import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty } from 'class-validator';

export class UploadChunkDto {
  @ApiProperty({ description: '上传任务ID', example: 'upload-uuid-123' })
  @IsString()
  @IsNotEmpty()
  uploadId: string;

  @ApiProperty({ description: '分片索引（从0开始）', example: 0 })
  @IsNumber()
  @IsNotEmpty()
  chunkIndex: number;

  @ApiProperty({ description: '分片MD5', example: 'd41d8cd98f00b204e9800998ecf8427e' })
  @IsString()
  @IsNotEmpty()
  chunkHash: string;
}
