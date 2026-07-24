import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function cleanup() {
  console.log("Cleaning database...");
  
  await prisma.secret.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.groupUser.deleteMany();
  await prisma.group.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.resourceTag.deleteMany();
  await prisma.folder.deleteMany();
  await prisma.userFavorite.deleteMany();
  await prisma.session.deleteMany();
  await prisma.gpgKey.deleteMany();
  await prisma.user.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.organizationMembership.deleteMany();
  await prisma.organization.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.shareHistory.deleteMany();
  
  console.log("Database cleaned");
  await prisma.$disconnect();
}

cleanup().catch(console.error);
