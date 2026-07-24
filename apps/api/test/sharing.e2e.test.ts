import { Test } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { createTestInvite, disconnectTestPrisma, cleanupTestInviter } from "./test-org.helper";
import {
  decryptMessage,
  decryptWithPassphrase,
  encryptMessage,
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
    publicKeyArmored: keypair.publicKeyArmored,
    privateKeyArmored,
  };
}

describe("Sharing e2e (share → recipient decrypts → revoke)", () => {
  let app: INestApplication;
  let userA: {
    accessToken: string;
    userId: string;
    publicKeyArmored: string;
    privateKeyArmored: string;
  };
  let userB: {
    accessToken: string;
    userId: string;
    publicKeyArmored: string;
    privateKeyArmored: string;
  };
  let resourceId: string;
  let originalEncryptedData: string;

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

    userA = await registerAndLogin(app, uniqueEmail("share-a"), PASSPHRASE);
    userB = await registerAndLogin(app, uniqueEmail("share-b"), PASSPHRASE);
  });

  afterAll(async () => {
    await cleanupTestInviter();
    await disconnectTestPrisma();
    await app?.close();
  });

  it("user A creates a resource", async () => {
    const secretPayload = JSON.stringify({
      username: "shared@example.com",
      password: "shared-secret",
    });

    originalEncryptedData = await encryptMessage(
      secretPayload,
      [userA.publicKeyArmored]
    );

    const res = await request(app.getHttpServer())
      .post("/api/v1/resources")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        name: "Shared Resource",
        uri: "https://example.com",
        encryptedData: originalEncryptedData,
      })
      .expect(201);

    resourceId = res.body.id;
  });

  it("user B cannot see the resource before sharing", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/resources")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(200);

    expect(
      res.body.find((r: { id: string }) => r.id === resourceId)
    ).toBeUndefined();
  });

  it("user A shares with user B (READ)", async () => {
    const secretPayload = JSON.stringify({
      username: "shared@example.com",
      password: "shared-secret",
    });

    const encryptedForB = await encryptMessage(
      secretPayload,
      [userB.publicKeyArmored]
    );

    await request(app.getHttpServer())
      .post(`/api/v1/resources/${resourceId}/share`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        recipients: [
          {
            userId: userB.userId,
            permission: "READ",
            encryptedData: encryptedForB,
          },
        ],
      })
      .expect(200);
  });

  it("user B can now see the resource in their list", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/resources")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(200);

    expect(
      res.body.find((r: { id: string }) => r.id === resourceId)
    ).toBeDefined();
  });

  it("user B can fetch and decrypt the shared secret", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}/secret`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(200);

    const { plaintext } = await decryptMessage(
      res.body.encryptedData,
      userB.privateKeyArmored
    );

    const decoded = JSON.parse(plaintext);
    expect(decoded.username).toBe("shared@example.com");
    expect(decoded.password).toBe("shared-secret");
  });

  it("user B cannot update the resource (READ only)", async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/resources/${resourceId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ name: "Hacked" })
      .expect(403);
  });

  it("user A can list permissions and sees user B", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}/permissions`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(res.body.length).toBe(2);
    const bPerm = res.body.find(
      (p: { aroId: string }) => p.aroId === userB.userId
    );
    expect(bPerm).toBeDefined();
    expect(bPerm.level).toBe("READ");
  });

  it("user A revokes user B's access", async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/resources/${resourceId}/share/${userB.userId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(204);
  });

  it("user B can no longer access the resource", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(404);

    const res = await request(app.getHttpServer())
      .get("/api/v1/resources")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(200);

    expect(
      res.body.find((r: { id: string }) => r.id === resourceId)
    ).toBeUndefined();
  });
});
