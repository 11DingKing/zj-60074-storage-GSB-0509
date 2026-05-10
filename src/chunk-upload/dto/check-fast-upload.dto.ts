import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckFastUploadDto {
  @ApiProperty({ description: '文件 MD5 哈希值' })
  @IsString()
  md5: string;
}
