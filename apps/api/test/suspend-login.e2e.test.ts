import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  decryptMessage,
  decryptWithPassphrase,
  encryptWithPassphrase,
  generateKeyPair,
} from "@clickrypt/crypto";
import { createTestInvite, disconnectTestPrisma, cleanupTestInviter } from "./test-org.helper";

const FAST_KDF = { memoryKiB: 1024, iterations: 1, parallelism: 1 };

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@clickrypt.test`;
}

async function registerAndLogin(
  app: INestApplication,
  email: string,
  passphrase: string
) {
  const keypair = await generateKeyPair({ name: "Test User", email });
  const encryptedPrivateKey = await encryptWithPassphrase(
    keypair.privateKeyArmored,
    passphrase,
    FAST_KDF
  );

  await createTestInvite(email);

  await request(app.getHttpServer())
    .post("/api/v1/users/register")
    .send({
      email,
      firstName: "Test",
      lastName: "User",
      armoredPublicKey: keypair.publicKeyArmored,
      encryptedPrivateKey,
    })
    .expect(201);

  const verifyRes = await request(app.getHttpServer())
    .post("/api/v1/auth/verify")
    .send({ email })
    .expect(200);

  const privateKeyArmored = await decryptWithPassphrase(
    verifyRes.body.encryptedPrivateKey,
    passphrase
  );

  const { plaintext: token } = await decryptMessage(
    verifyRes.body.challenge,
    privateKeyArmored
  );

  const loginRes = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email, token })
    .expect(200);

  return {
    accessToken: loginRes.body.accessToken as string,
    userId: loginRes.body.user.id as string,
    privateKeyArmored,
  };
}

async function loginUser(
  app: INestApplication,
  email: string,
  privateKeyArmored: string
) {
  const verifyRes = await request(app.getHttpServer())
    .post("/api/v1/auth/verify")
    .send({ email })
    .expect(200);

  const { plaintext: token } = await decryptMessage(
    verifyRes.body.challenge,
    privateKeyArmored
  );

  const loginRes = await request(app.getHttpServer())
    .post("/api/v1/auth/login")
    .send({ email, token });

  return loginRes;
}

describe("Suspend/Restore login e2e", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: {
    accessToken: string;
    userId: string;
    privateKeyArmored: string;
    email: string;
  };
  let target: {
    accessToken: string;
    userId: string;
    privateKeyArmored: string;
    email: string;
  };

  const PASSPHRASE = "correct horse battery staple";

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);

    // Register admin (will be promoted to OWNER)
    const adminEmail = uniqueEmail("suspend-admin");
    const adminUser = await registerAndLogin(app, adminEmail, PASSPHRASE);
    admin = { ...adminUser, email: adminEmail };

    // Promote admin to OWNER
    await prisma.user.update({
      where: { id: admin.userId },
      data: { orgRole: "OWNER" },
    });
    await prisma.organizationMembership.updateMany({
      where: { userId: admin.userId },
      data: { role: "OWNER" },
    });

    // Re-login admin to get fresh JWT with OWNER role
    const adminLogin = await loginUser(app, adminEmail, admin.privateKeyArmored);
    admin.accessToken = adminLogin.body.accessToken;

    // Register target user (regular USER)
    const targetEmail = uniqueEmail("suspend-target");
    const targetUser = await registerAndLogin(app, targetEmail, PASSPHRASE);
    target = { ...targetUser, email: targetEmail };
  });

  afterAll(async () => {
    // Clean up test users
    if (target?.userId) {
      try {
        await prisma.session.deleteMany({ where: { userId: target.userId } });
        await prisma.gpgKey.deleteMany({ where: { userId: target.userId } });
        await prisma.organizationMembership.deleteMany({ where: { userId: target.userId } });
        await prisma.user.delete({ where: { id: target.userId } });
      } catch {}
    }
    if (admin?.userId) {
      try {
        await prisma.session.deleteMany({ where: { userId: admin.userId } });
        await prisma.gpgKey.deleteMany({ where: { userId: admin.userId } });
        await prisma.organizationMembership.deleteMany({ where: { userId: admin.userId } });
        await prisma.user.delete({ where: { id: admin.userId } });
      } catch {}
    }
    await cleanupTestInviter();
    await disconnectTestPrisma();
    await app?.close();
  });

  it("admin can suspend a user and they cannot login", async () => {
    // Suspend target user
    await request(app.getHttpServer())
      .put(`/api/v1/admin/users/${target.userId}/status`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "SUSPENDED" })
      .expect(200);

    // Verify user status in DB
    const dbUser = await prisma.user.findUnique({ where: { id: target.userId } });
    expect(dbUser?.status).toBe("SUSPENDED");

    // Verify suspended user gets a decoy challenge (can't decrypt with their key)
    const verifyRes = await request(app.getHttpServer())
      .post("/api/v1/auth/verify")
      .send({ email: target.email })
      .expect(200);

    // Decryption should fail because the challenge is encrypted to a decoy key
    let loginBlocked = false;
    try {
      await decryptMessage(verifyRes.body.challenge, target.privateKeyArmored);
    } catch {
      loginBlocked = true;
    }
    expect(loginBlocked).toBe(true);
  });

  it("suspended user's existing access token is rejected", async () => {
    // The old access token should no longer work (session revoked in Redis)
    const res = await request(app.getHttpServer())
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${target.accessToken}`)
      .expect(401);

    expect(res.body.message).toContain("Session has been revoked");
  });

  it("admin can restore a user and they can login again", async () => {
    // Restore target user
    await request(app.getHttpServer())
      .put(`/api/v1/admin/users/${target.userId}/status`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "ACTIVE" })
      .expect(200);

    // Verify user status in DB
    const dbUser = await prisma.user.findUnique({ where: { id: target.userId } });
    expect(dbUser?.status).toBe("ACTIVE");

    // Verify user can login again
    const loginRes = await loginUser(app, target.email, target.privateKeyArmored);
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.accessToken).toBeDefined();

    // Update target's access token for subsequent tests
    target.accessToken = loginRes.body.accessToken;
  });

  it("admin cannot suspend themselves", async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/admin/users/${admin.userId}/status`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "SUSPENDED" })
      .expect(403);

    expect(res.body.message).toContain("own account");
  });

  it("admin cannot suspend the OWNER", async () => {
    // Register another user, promote to ADMIN
    const otherEmail = uniqueEmail("suspend-other-admin");
    const otherUser = await registerAndLogin(app, otherEmail, PASSPHRASE);
    await prisma.user.update({
      where: { id: otherUser.userId },
      data: { orgRole: "ADMIN" },
    });
    await prisma.organizationMembership.updateMany({
      where: { userId: otherUser.userId },
      data: { role: "ADMIN" },
    });

    // Re-login as the ADMIN user
    const otherLogin = await loginUser(app, otherEmail, otherUser.privateKeyArmored);
    const otherAccessToken = otherLogin.body.accessToken;

    // ADMIN tries to suspend OWNER (admin)
    const res = await request(app.getHttpServer())
      .put(`/api/v1/admin/users/${admin.userId}/status`)
      .set("Authorization", `Bearer ${otherAccessToken}`)
      .send({ status: "SUSPENDED" })
      .expect(403);

    expect(res.body.message).toContain("Owner");

    // Cleanup
    try {
      await prisma.session.deleteMany({ where: { userId: otherUser.userId } });
      await prisma.gpgKey.deleteMany({ where: { userId: otherUser.userId } });
      await prisma.organizationMembership.deleteMany({ where: { userId: otherUser.userId } });
      await prisma.user.delete({ where: { id: otherUser.userId } });
    } catch {}
  });

  it("ADMIN cannot suspend another ADMIN (only OWNER can)", async () => {
    // Register two users, promote both to ADMIN
    const admin1Email = uniqueEmail("suspend-admin1");
    const admin1 = await registerAndLogin(app, admin1Email, PASSPHRASE);
    await prisma.user.update({
      where: { id: admin1.userId },
      data: { orgRole: "ADMIN" },
    });
    await prisma.organizationMembership.updateMany({
      where: { userId: admin1.userId },
      data: { role: "ADMIN" },
    });

    const admin2Email = uniqueEmail("suspend-admin2");
    const admin2 = await registerAndLogin(app, admin2Email, PASSPHRASE);
    await prisma.user.update({
      where: { id: admin2.userId },
      data: { orgRole: "ADMIN" },
    });
    await prisma.organizationMembership.updateMany({
      where: { userId: admin2.userId },
      data: { role: "ADMIN" },
    });

    // Re-login both admins
    const admin1Login = await loginUser(app, admin1Email, admin1.privateKeyArmored);
    const admin1Token = admin1Login.body.accessToken;

    // admin1 (ADMIN) tries to suspend admin2 (ADMIN) — should fail
    const res = await request(app.getHttpServer())
      .put(`/api/v1/admin/users/${admin2.userId}/status`)
      .set("Authorization", `Bearer ${admin1Token}`)
      .send({ status: "SUSPENDED" })
      .expect(403);

    expect(res.body.message).toContain("Only the Owner can suspend");

    // OWNER can suspend admin2
    await request(app.getHttpServer())
      .put(`/api/v1/admin/users/${admin2.userId}/status`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ status: "SUSPENDED" })
      .expect(200);

    // Verify admin2 is suspended
    const dbUser = await prisma.user.findUnique({ where: { id: admin2.userId } });
    expect(dbUser?.status).toBe("SUSPENDED");

    // Cleanup
    try {
      for (const u of [admin1, admin2]) {
        await prisma.session.deleteMany({ where: { userId: u.userId } });
        await prisma.gpgKey.deleteMany({ where: { userId: u.userId } });
        await prisma.organizationMembership.deleteMany({ where: { userId: u.userId } });
        await prisma.user.delete({ where: { id: u.userId } });
      }
    } catch {}
  });
});
