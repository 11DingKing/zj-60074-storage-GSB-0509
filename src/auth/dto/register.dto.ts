import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEmail, IsOptional, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ description: '用户名', example: 'user123' })
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty({ description: '密码', example: 'password123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ description: '邮箱（可选）', example: 'user@example.com', required: false })
  @IsEmail()
  @IsOptional()
  email?: string;
}
