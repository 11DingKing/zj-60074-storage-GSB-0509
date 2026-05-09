-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "storageQuota" BIGINT NOT NULL DEFAULT 10737418240,
    "storageUsed" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "extension" TEXT,
    "md5" TEXT NOT NULL,
    "referenceCount" INTEGER NOT NULL DEFAULT 1,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "accessControl" TEXT NOT NULL DEFAULT 'private',
    "thumbnailPath" TEXT,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chunk_uploads" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalSize" BIGINT NOT NULL,
    "totalChunks" INTEGER NOT NULL,
    "uploadedChunks" INTEGER NOT NULL DEFAULT 0,
    "chunkHashes" TEXT[],
    "md5" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chunk_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recycle_bin" (
    "id" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemPath" TEXT NOT NULL,
    "itemSize" BIGINT NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "fileId" TEXT,
    "folderId" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recycle_bin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "share_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expireAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "maxAccessCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "share_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operation_logs" (
    "id" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileId" TEXT,
    "fileName" TEXT,
    "filePath" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "files_md5_idx" ON "files"("md5");

-- CreateIndex
CREATE INDEX "files_userId_idx" ON "files"("userId");

-- CreateIndex
CREATE INDEX "files_folderId_idx" ON "files"("folderId");

-- CreateIndex
CREATE INDEX "folders_userId_idx" ON "folders"("userId");

-- CreateIndex
CREATE INDEX "folders_parentId_idx" ON "folders"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "chunk_uploads_uploadId_key" ON "chunk_uploads"("uploadId");

-- CreateIndex
CREATE INDEX "chunk_uploads_uploadId_idx" ON "chunk_uploads"("uploadId");

-- CreateIndex
CREATE INDEX "chunk_uploads_userId_idx" ON "chunk_uploads"("userId");

-- CreateIndex
CREATE INDEX "recycle_bin_userId_idx" ON "recycle_bin"("userId");

-- CreateIndex
CREATE INDEX "recycle_bin_expireAt_idx" ON "recycle_bin"("expireAt");

-- CreateIndex
CREATE UNIQUE INDEX "share_links_token_key" ON "share_links"("token");

-- CreateIndex
CREATE INDEX "share_links_token_idx" ON "share_links"("token");

-- CreateIndex
CREATE INDEX "share_links_expireAt_idx" ON "share_links"("expireAt");

-- CreateIndex
CREATE INDEX "operation_logs_userId_idx" ON "operation_logs"("userId");

-- CreateIndex
CREATE INDEX "operation_logs_operation_idx" ON "operation_logs"("operation");

-- CreateIndex
CREATE INDEX "operation_logs_createdAt_idx" ON "operation_logs"("createdAt");

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "folders" ADD CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recycle_bin" ADD CONSTRAINT "recycle_bin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recycle_bin" ADD CONSTRAINT "recycle_bin_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recycle_bin" ADD CONSTRAINT "recycle_bin_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_logs" ADD CONSTRAINT "operation_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation_logs" ADD CONSTRAINT "operation_logs_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
