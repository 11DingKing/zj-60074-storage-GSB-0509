import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('开始执行 seed 数据...');

  const adminPassword = 'admin123';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: hashedPassword,
      email: 'admin@example.com',
      isAdmin: true,
      storageQuota: BigInt(10737418240),
    },
  });

  console.log('创建管理员用户:', admin.username);

  const defaultFolders = ['文档', '图片', '视频', '音乐', '下载'];

  for (const folderName of defaultFolders) {
    const existingFolder = await prisma.folder.findFirst({
      where: {
        userId: admin.id,
        path: `/${folderName}`,
      },
    });
    
    if (!existingFolder) {
      await prisma.folder.create({
        data: {
          name: folderName,
          path: `/${folderName}`,
          userId: admin.id,
        },
      });
      console.log('创建默认文件夹:', folderName);
    } else {
      console.log('默认文件夹已存在:', folderName);
    }
  }

  const subFolders = {
    '文档': ['工作文档', '个人文档', '学习资料'],
    '图片': ['旅行照片', '工作图片', '截图'],
    '视频': ['电影', '教程', '记录'],
    '音乐': ['流行', '古典', '电子'],
    '下载': ['软件', '压缩包'],
  };

  for (const [parentName, children] of Object.entries(subFolders)) {
    const parentFolder = await prisma.folder.findFirst({
      where: {
        userId: admin.id,
        name: parentName,
      },
    });

    if (parentFolder) {
      for (const childName of children) {
        const existingChild = await prisma.folder.findFirst({
          where: {
            userId: admin.id,
            path: `${parentFolder.path}/${childName}`,
          },
        });
        
        if (!existingChild) {
          await prisma.folder.create({
            data: {
              name: childName,
              path: `${parentFolder.path}/${childName}`,
              userId: admin.id,
              parentId: parentFolder.id,
            },
          });
          console.log('创建子文件夹:', `${parentName}/${childName}`);
        } else {
          console.log('子文件夹已存在:', `${parentName}/${childName}`);
        }
      }
    }
  }

  console.log('Seed 数据执行完成!');
  console.log('');
  console.log('管理员账户信息:');
  console.log('  用户名: admin');
  console.log('  密码: admin123');
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
