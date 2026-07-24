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

describe("Admin Add Member e2e", () => {
  let app: INestApplication;
  let admin: {
    accessToken: string;
    userId: string;
    privateKeyArmored: string;
  };
  let adminEmail: string;

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

    admin = await registerAndLogin(
      app,
      (adminEmail = uniqueEmail("admin-add")),
      PASSPHRASE
    );

    // Promote to ADMIN via Prisma directly
    const prisma = app.get(PrismaService);
    await prisma.user.update({
      where: { id: admin.userId },
      data: { orgRole: "ADMIN" },
    });

    // Re-login so the new orgRole is reflected in JWT claims
    const verifyRes = await request(app.getHttpServer())
      .post("/api/v1/auth/verify")
      .send({ email: adminEmail })
      .expect(200);
    const { plaintext: loginToken } = await decryptMessage(
      verifyRes.body.challenge,
      admin.privateKeyArmored
    );
    const loginRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: adminEmail, token: loginToken })
      .expect(200);
    admin.accessToken = loginRes.body.accessToken;
  });

  afterAll(async () => {
    await cleanupTestInviter();
    await disconnectTestPrisma();
    await app?.close();
  });

  it("non-admin cannot add a member", async () => {
    // Register a regular USER
    const userEmail = uniqueEmail("regular-user");
    const user = await registerAndLogin(app, userEmail, PASSPHRASE);

    await request(app.getHttpServer())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        email: uniqueEmail("newmember"),
        firstName: "New",
        lastName: "Member",
        role: "USER",
      })
      .expect(403);
  });

  it("admin can directly add a member with ACTIVE status", async () => {
    const memberEmail = uniqueEmail("added-member");

    const res = await request(app.getHttpServer())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        email: memberEmail,
        firstName: "Added",
        lastName: "Member",
        role: "USER",
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.email).toBe(memberEmail);
    expect(res.body.firstName).toBe("Added");
    expect(res.body.lastName).toBe("Member");
    expect(res.body.status).toBe("ACTIVE");
    expect(res.body.orgRole).toBe("USER");
  });

  it("added member appears in the user list", async () => {
    const memberEmail = uniqueEmail("listed-member");
    await request(app.getHttpServer())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        email: memberEmail,
        firstName: "Listed",
        lastName: "Member",
        role: "USER",
      })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .expect(200);

    expect(res.body.some((u: { email: string }) => u.email === memberEmail)).toBe(true);
  });

  it("added member has an organization membership", async () => {
    const memberEmail = uniqueEmail("membership-member");
    const createRes = await request(app.getHttpServer())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        email: memberEmail,
        firstName: "Membership",
        lastName: "Member",
        role: "ADMIN",
      })
      .expect(201);

    const prisma = app.get(PrismaService);
    const membership = await prisma.organizationMembership.findUnique({
      where: {
        organizationId_userId: {
          organizationId: createRes.body.orgId ?? "",
          userId: createRes.body.id,
        },
      },
    });

    // The membership may not be findable if orgId isn't returned; check via user
    const user = await prisma.user.findUnique({
      where: { id: createRes.body.id },
      select: { orgId: true },
    });

    const membership2 = user
      ? await prisma.organizationMembership.findUnique({
          where: {
            organizationId_userId: {
              organizationId: user.orgId,
              userId: createRes.body.id,
            },
          },
        })
      : null;

    expect(membership2).not.toBeNull();
    expect(membership2?.status).toBe("ACTIVE");
    expect(membership2?.role).toBe("ADMIN");
  });

  it("rejects duplicate email", async () => {
    const memberEmail = uniqueEmail("dup-member");
    await request(app.getHttpServer())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        email: memberEmail,
        firstName: "Dup",
        lastName: "Member",
        role: "USER",
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        email: memberEmail,
        firstName: "Dup",
        lastName: "Member",
        role: "USER",
      })
      .expect(409);
  });

  it("rejects invalid role", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/admin/users")
      .set("Authorization", `Bearer ${admin.accessToken}`)
      .send({
        email: uniqueEmail("bad-role"),
        firstName: "Bad",
        lastName: "Role",
        role: "SUPERADMIN",
      })
      .expect(400);
  });
});
