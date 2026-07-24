import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import {
  decryptMessage,
  encryptWithPassphrase,
  generateKeyPair,
} from "@clickrypt/crypto";
import {
  createTestInvite,
  cleanupTestInviter,
  disconnectTestPrisma,
} from "./test-org.helper";

const FAST_KDF = { memoryKiB: 1024, iterations: 1, parallelism: 1 };
const PASSPHRASE = "correct horse battery staple";

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@clickrypt.test`;
}

async function login(
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
    .send({ email, token })
    .expect(200);

  return loginRes.body.accessToken as string;
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

  await createTestInvite(email, "ADMIN");

  await request(app.getHttpServer())
    .post("/api/v1/users/register")
    .send({
      email,
      firstName: "Admin",
      lastName: "User",
      armoredPublicKey: keypair.publicKeyArmored,
      encryptedPrivateKey,
    })
    .expect(201);

  const accessToken = await login(app, email, keypair.privateKeyArmored);

  const me = await request(app.getHttpServer())
    .get("/api/v1/users/me")
    .set("Authorization", `Bearer ${accessToken}`)
    .expect(200);

  return {
    accessToken,
    userId: me.body.id as string,
    orgId: me.body.orgId as string,
    privateKeyArmored: keypair.privateKeyArmored,
  };
}

async function acceptInvite(
  app: INestApplication,
  token: string,
  email: string,
  passphrase: string
) {
  const keypair = await generateKeyPair({ name: "Invited User", email });
  const encryptedPrivateKey = await encryptWithPassphrase(
    keypair.privateKeyArmored,
    passphrase,
    FAST_KDF
  );

  const res = await request(app.getHttpServer())
    .post(`/api/v1/invitations/${token}/accept`)
    .send({
      firstName: "Invited",
      lastName: "User",
      armoredPublicKey: keypair.publicKeyArmored,
      encryptedPrivateKey,
    })
    .expect(201);

  return {
    userId: res.body.id as string,
    privateKeyArmored: keypair.privateKeyArmored,
  };
}

describe("Admin delete user e2e", () => {
  let app: INestApplication;
  let admin: {
    accessToken: string;
    userId: string;
    orgId: string;
    privateKeyArmored: string;
  };
  let adminEmail: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true })
    );
    await app.init();

    adminEmail = uniqueEmail("admin-delete");
    admin = await registerAndLogin(app, adminEmail, PASSPHRASE);

    // Promote to OWNER so we can invite other admins and delete them
    const prisma = app.get(PrismaService);
    await prisma.user.update({
      where: { id: admin.userId },
      data: { orgRole: "OWNER" },
    });
    await prisma.organizationMembership.update({
      where: {
        organizationId_userId: {
          organizationId: admin.orgId,
          userId: admin.userId,
        },
      },
      data: { role: "OWNER" },
    });

    admin.accessToken = await login(app, adminEmail, admin.privateKeyArmored);
  });

  afterAll(async () => {
    await cleanupTestInviter();
    await disconnectTestPrisma();
    await app?.close();
  });

  it("admin can delete a user who accepted an invitation", async () => {
    const memberEmail = uniqueEmail("invited-member");

    const inviteRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${admin.orgId}/invitations`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ email: memberEmail, role: "USER" })
      .expect(201);

    const { userId: memberId } = await acceptInvite(
      app,
      inviteRes.body.token as string,
      memberEmail,
      PASSPHRASE
    );

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/users/${memberId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(204);
  });

  it("admin can delete a user who sent an invitation", async () => {
    // Owner A invites B as ADMIN
    const adminBEmail = uniqueEmail("admin-b");
    const inviteBRes = await request(app.getHttpServer())
      .post(`/api/v1/organizations/${admin.orgId}/invitations`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({ email: adminBEmail, role: "ADMIN" })
      .expect(201);

    const { userId: adminBId, privateKeyArmored: adminBKey } =
      await acceptInvite(app, inviteBRes.body.token as string, adminBEmail, PASSPHRASE);

    const adminBToken = await login(app, adminBEmail, adminBKey);

    // B invites C as USER; the invite row will reference B as inviter
    const userCEmail = uniqueEmail("user-c");
    await request(app.getHttpServer())
      .post(`/api/v1/organizations/${admin.orgId}/invitations`)
      .set("Authorization", `Bearer ${adminBToken}`)
      .send({ email: userCEmail, role: "USER" })
      .expect(201);

    // A deletes B; this must also delete B's sent invite (invitedById FK)
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/users/${adminBId}`)
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(204);
  });
});
