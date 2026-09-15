-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('OFFROAD', 'RESTORATION');

-- CreateEnum
CREATE TYPE "WorkType" AS ENUM ('DIY', 'WORKSHOP');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('OWNER', 'COLLABORATOR');

-- CreateEnum
CREATE TYPE "CollaboratorRole" AS ENUM ('MECHANIC', 'SPECIALIST');

-- CreateEnum
CREATE TYPE "CollaboratorStatus" AS ENUM ('PENDING', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('ITP', 'RCA', 'CASCO', 'ROVINIETA', 'FIRST_AID_KIT', 'FIRE_EXTINGUISHER', 'VIGNETTE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "displayName" TEXT NOT NULL,
    "location" TEXT,
    "avatarUrl" TEXT,
    "isPublicProfile" BOOLEAN NOT NULL DEFAULT false,
    "preferredMode" "ProjectType",
    "accountType" "AccountType" NOT NULL DEFAULT 'OWNER',
    "isPro" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,

    CONSTRAINT "OAuthAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "projectType" "ProjectType" NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "generation" TEXT,
    "engine" TEXT,
    "vin" TEXT,
    "coverPhotoUrl" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "addedByUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "workType" "WorkType" NOT NULL DEFAULT 'DIY',
    "costRon" DECIMAL(10,2),
    "partsCostRon" DECIMAL(10,2),
    "labourCostRon" DECIMAL(10,2),
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "workshopId" TEXT,
    "workshopName" TEXT,
    "workshopContact" TEXT,
    "supplierUrl" TEXT,
    "originalityCondition" TEXT,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workshop" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "speciality" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workshop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskPhoto" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "photoType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoundState" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "acquisitionDate" TIMESTAMP(3) NOT NULL,
    "purchasePriceRon" DECIMAL(10,2),
    "odometer" INTEGER,
    "knownHistory" TEXT,
    "conditionRating" INTEGER,
    "frontNotes" TEXT,
    "rearNotes" TEXT,
    "leftNotes" TEXT,
    "rightNotes" TEXT,
    "roofNotes" TEXT,
    "floorNotes" TEXT,
    "engineNotes" TEXT,
    "interiorNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoundState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoundStatePhoto" (
    "id" TEXT NOT NULL,
    "foundStateId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FoundStatePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WishlistItem" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "estimatedCostRon" DECIMAL(10,2),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "partCondition" TEXT,
    "supplierUrl" TEXT,
    "hardToFind" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WishlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrailRun" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "distanceKm" DECIMAL(6,2),
    "durationMin" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrailRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "fileUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectCollaborator" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "collaboratorUserId" TEXT,
    "email" TEXT NOT NULL,
    "role" "CollaboratorRole" NOT NULL DEFAULT 'MECHANIC',
    "label" TEXT,
    "status" "CollaboratorStatus" NOT NULL DEFAULT 'PENDING',
    "inviteToken" TEXT NOT NULL,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectCollaborator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "OAuthAccount_userId_idx" ON "OAuthAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthAccount_provider_providerAccountId_key" ON "OAuthAccount"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "Vehicle_ownerId_idx" ON "Vehicle"("ownerId");

-- CreateIndex
CREATE INDEX "Task_vehicleId_idx" ON "Task"("vehicleId");

-- CreateIndex
CREATE INDEX "Task_addedByUserId_idx" ON "Task"("addedByUserId");

-- CreateIndex
CREATE INDEX "Task_workshopId_idx" ON "Task"("workshopId");

-- CreateIndex
CREATE INDEX "Workshop_vehicleId_idx" ON "Workshop"("vehicleId");

-- CreateIndex
CREATE INDEX "TaskPhoto_taskId_idx" ON "TaskPhoto"("taskId");

-- CreateIndex
CREATE INDEX "TaskPhoto_vehicleId_idx" ON "TaskPhoto"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "FoundState_vehicleId_key" ON "FoundState"("vehicleId");

-- CreateIndex
CREATE INDEX "FoundStatePhoto_foundStateId_idx" ON "FoundStatePhoto"("foundStateId");

-- CreateIndex
CREATE INDEX "WishlistItem_vehicleId_idx" ON "WishlistItem"("vehicleId");

-- CreateIndex
CREATE INDEX "TrailRun_vehicleId_idx" ON "TrailRun"("vehicleId");

-- CreateIndex
CREATE INDEX "Document_vehicleId_idx" ON "Document"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCollaborator_inviteToken_key" ON "ProjectCollaborator"("inviteToken");

-- CreateIndex
CREATE INDEX "ProjectCollaborator_vehicleId_idx" ON "ProjectCollaborator"("vehicleId");

-- CreateIndex
CREATE INDEX "ProjectCollaborator_collaboratorUserId_idx" ON "ProjectCollaborator"("collaboratorUserId");

-- AddForeignKey
ALTER TABLE "OAuthAccount" ADD CONSTRAINT "OAuthAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workshopId_fkey" FOREIGN KEY ("workshopId") REFERENCES "Workshop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workshop" ADD CONSTRAINT "Workshop_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskPhoto" ADD CONSTRAINT "TaskPhoto_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoundState" ADD CONSTRAINT "FoundState_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoundStatePhoto" ADD CONSTRAINT "FoundStatePhoto_foundStateId_fkey" FOREIGN KEY ("foundStateId") REFERENCES "FoundState"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishlistItem" ADD CONSTRAINT "WishlistItem_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailRun" ADD CONSTRAINT "TrailRun_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCollaborator" ADD CONSTRAINT "ProjectCollaborator_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCollaborator" ADD CONSTRAINT "ProjectCollaborator_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectCollaborator" ADD CONSTRAINT "ProjectCollaborator_collaboratorUserId_fkey" FOREIGN KEY ("collaboratorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
