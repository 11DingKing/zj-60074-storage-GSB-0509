import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateShareLinkDto {
  @ApiProperty({ description: '文件ID', example: 'uuid' })
  @IsString()
  @IsNotEmpty()
  fileId: string;

  @ApiProperty({ description: '过期时间（小时），默认24小时', example: 24, required: false })
  @IsNumber()
  @IsOptional()
  expireHours?: number;

  @ApiProperty({ description: '最大访问次数（可选）', example: 10, required: false })
  @IsNumber()
  @IsOptional()
  maxAccessCount?: number;
}
