import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @ApiProperty({ description: '用户名', example: 'admin' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ description: '密码', example: 'admin123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
