import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

const prisma = new PrismaClient();

/**
 * Ensures an organization exists for e2e tests (registration requires one).
 * Returns the first org, creating an ORGANIZATION-mode one if none exists.
 * Uses raw SQL to update mode if needed to work around Prisma client generation issues.
 */
export async function ensureTestOrg() {
  let org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: "E2E Test Org", mode: "ORGANIZATION" },
    });
  } else {
    // Use raw SQL to update mode to ORGANIZATION for multi-user tests
    await prisma.$executeRawUnsafe(`UPDATE "organizations" SET "mode" = 'ORGANIZATION' WHERE "id" = '${org.id}'`);
    org.mode = "ORGANIZATION" as any;
  }
  return org;
}

/**
 * Creates a pending invite for the given email so that /users/register
 * accepts it (open registration is invite-only). Uses a dummy inviter user.
 */
export async function createTestInvite(
  email: string,
  role: "OWNER" | "ADMIN" | "USER" = "USER"
) {
  const org = await ensureTestOrg();

  let inviter = await prisma.user.findFirst({
    where: { email: "e2e-inviter@clickrypt.local" },
  });
  if (!inviter) {
    inviter = await prisma.user.create({
      data: {
        email: "e2e-inviter@clickrypt.local",
        firstName: "E2E",
        lastName: "Inviter",
        orgId: org.id,
        orgRole: "OWNER",
        status: "ACTIVE",
      },
    });
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  await prisma.invite.create({
    data: {
      orgId: org.id,
      email: email.toLowerCase(),
      role,
      tokenHash,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      invitedById: inviter.id,
    },
  });

  return token;
}

/**
 * Cleans up the e2e-inviter test user and all related data.
 * Call this in afterAll hooks to prevent test data from persisting.
 */
export async function cleanupTestInviter() {
  const inviter = await prisma.user.findFirst({
    where: { email: "e2e-inviter@clickrypt.local" },
    select: { id: true },
  });
  if (!inviter) return;

  await prisma.$transaction([
    prisma.gpgKey.deleteMany({ where: { userId: inviter.id } }),
    prisma.groupUser.deleteMany({ where: { userId: inviter.id } }),
    prisma.secret.deleteMany({ where: { userId: inviter.id } }),
    prisma.permission.deleteMany({ where: { aroId: inviter.id } }),
    prisma.session.deleteMany({ where: { userId: inviter.id } }),
    prisma.mfaDevice.deleteMany({ where: { userId: inviter.id } }),
    prisma.userFavorite.deleteMany({ where: { userId: inviter.id } }),
    prisma.shareHistory.deleteMany({ where: { sharedById: inviter.id } }),
    prisma.shareHistory.deleteMany({ where: { sharedWithId: inviter.id } }),
    prisma.auditLog.deleteMany({ where: { userId: inviter.id } }),
    prisma.recoveryRequest.deleteMany({ where: { userId: inviter.id } }),
    prisma.organizationMembership.deleteMany({ where: { userId: inviter.id } }),
    prisma.invite.deleteMany({ where: { invitedById: inviter.id } }),
  ]);

  await prisma.user.delete({ where: { id: inviter.id } });
}

export async function disconnectTestPrisma() {
  await prisma.$disconnect();
}
