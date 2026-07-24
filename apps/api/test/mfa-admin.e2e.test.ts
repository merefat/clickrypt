import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { generate, generateSecret } from "otplib";
import { createTestInvite, disconnectTestPrisma, cleanupTestInviter } from "./test-org.helper";
import {
  decryptMessage,
  decryptWithPassphrase,
  encryptWithPassphrase,
  generateKeyPair,
} from "@clickrypt/crypto";

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

describe("MFA + Admin e2e", () => {
  let app: INestApplication;
  let user: {
    accessToken: string;
    userId: string;
    privateKeyArmored: string;
  };
  let userEmail: string;
  let totpSecret: string;

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

    user = await registerAndLogin(app, (userEmail = uniqueEmail("mfa")), PASSPHRASE);
  });

  afterAll(async () => {
    await cleanupTestInviter();
    await disconnectTestPrisma();
    await app?.close();
  });

  // ── MFA tests ──────────────────────────────────────────────────────────

  it("reports MFA as disabled initially", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/mfa/status")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body.enabled).toBe(false);
  });

  it("enrolls TOTP and returns a secret + otpauth URI", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/mfa/totp/enroll")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(201);

    expect(res.body.secret).toBeDefined();
    expect(res.body.otpauthUri).toContain("otpauth://totp/");
    totpSecret = res.body.secret;
  });

  it("verifies TOTP code and enables MFA", async () => {
    const code = await generate({ secret: totpSecret });
    const res = await request(app.getHttpServer())
      .post("/api/v1/mfa/totp/verify")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({ code })
      .expect(201);

    expect(res.body.enabled).toBe(true);
  });

  it("reports MFA as enabled after verification", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/mfa/status")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body.enabled).toBe(true);
  });

  it("login now requires MFA", async () => {
    const verifyRes = await request(app.getHttpServer())
      .post("/api/v1/auth/verify")
      .send({ email: uniqueEmail("mfa"), })
      .expect(200);

    // Re-do verify with the actual email
    const email = (await request(app.getHttpServer())
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200)).body.email;

    const verifyRes2 = await request(app.getHttpServer())
      .post("/api/v1/auth/verify")
      .send({ email })
      .expect(200);

    const privateKeyArmored = await decryptWithPassphrase(
      verifyRes2.body.encryptedPrivateKey,
      PASSPHRASE
    );

    const { plaintext: token } = await decryptMessage(
      verifyRes2.body.challenge,
      privateKeyArmored
    );

    const loginRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, token })
      .expect(200);

    expect(loginRes.body.mfaRequired).toBe(true);
    expect(loginRes.body.mfaToken).toBeDefined();
  });

  it("disables MFA", async () => {
    await request(app.getHttpServer())
      .delete("/api/v1/mfa")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get("/api/v1/mfa/status")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body.enabled).toBe(false);
  });

  // ── Admin tests ────────────────────────────────────────────────────────

  it("non-admin cannot access admin endpoints", async () => {
    await request(app.getHttpServer())
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(403);
  });

  it("admin can list users", async () => {
    // Promote user to org ADMIN via Prisma directly
    const prisma = app.get(PrismaService);
    await prisma.user.update({
      where: { id: user.userId },
      data: { orgRole: "ADMIN" },
    });

    // Re-login so the new orgRole is reflected in the JWT claims
    const verifyRes = await request(app.getHttpServer())
      .post("/api/v1/auth/verify")
      .send({ email: userEmail })
      .expect(200);
    const { plaintext: loginToken } = await decryptMessage(
      verifyRes.body.challenge,
      user.privateKeyArmored
    );
    const loginRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: userEmail, token: loginToken })
      .expect(200);
    user.accessToken = loginRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .get("/api/v1/admin/users")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.some((u: { id: string }) => u.id === user.userId)).toBe(true);
  });

  it("admin can list audit logs", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/admin/audit-logs")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(200);

    expect(res.body.items).toBeDefined();
    expect(typeof res.body.total).toBe("number");
  });
});
