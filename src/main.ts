import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { BigIntInterceptor } from './common/interceptors/bigint.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
  }));
  
  app.useGlobalInterceptors(new BigIntInterceptor());
  
  app.setGlobalPrefix('api');
  
  const config = new DocumentBuilder()
    .setTitle('文件存储管理服务 API')
    .setDescription('一个类似简化版 MinIO 的文件存储管理服务，支持文件上传、下载、分享、回收站等功能')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('认证', '用户登录和注册相关接口')
    .addTag('文件上传', '单文件、多文件上传相关接口')
    .addTag('分片上传', '大文件分片上传、断点续传、秒传相关接口')
    .addTag('文件管理', '文件和文件夹的增删改查、回收站相关接口')
    .addTag('文件下载', '文件下载、打包下载、分享链接相关接口')
    .addTag('文件预览', '文件预览、缩略图、搜索相关接口')
    .addTag('存储空间', '存储配额、空间使用统计相关接口')
    .addTag('操作日志', '操作日志查询相关接口')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  
  const port = process.env.PORT || 13074;
  await app.listen(port);
  console.log(`文件存储管理服务已启动，端口: ${port}`);
  console.log(`API 文档地址: http://localhost:${port}/api/docs`);
}

bootstrap();
