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
  type EncryptedBlob,
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
  const keypair = await generateKeyPair({
    name: "Test User",
    email,
  });
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
    publicKeyArmored: keypair.publicKeyArmored,
    privateKeyArmored,
  };
}

describe("Resources e2e (create → list → get → secret → update → delete)", () => {
  let app: INestApplication;
  let userA: {
    accessToken: string;
    publicKeyArmored: string;
    privateKeyArmored: string;
  };
  let userB: {
    accessToken: string;
    publicKeyArmored: string;
    privateKeyArmored: string;
  };
  let resourceId: string;
  let folderId: string;
  let tagId: string;

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

    userA = await registerAndLogin(
      app,
      uniqueEmail("res-a"),
      PASSPHRASE
    );
    userB = await registerAndLogin(
      app,
      uniqueEmail("res-b"),
      PASSPHRASE
    );
  });

  afterAll(async () => {
    await cleanupTestInviter();
    await disconnectTestPrisma();
    await app?.close();
  });

  it("creates a folder", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/folders")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ name: "Work" })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Work");
    folderId = res.body.id;
  });

  it("lists folders", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/folders")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.some((f: { id: string }) => f.id === folderId)).toBe(true);
  });

  it("creates a tag", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/tags")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ name: "important", color: "#ef4444" })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("important");
    tagId = res.body.id;
  });

  it("creates a resource with an encrypted secret", async () => {
    const secretPayload = JSON.stringify({
      username: "ada@example.com",
      password: "super-secret-123",
    });

    const encryptedData = await encryptMessage(
      secretPayload,
      [userA.publicKeyArmored]
    );

    const res = await request(app.getHttpServer())
      .post("/api/v1/resources")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        name: "GitHub",
        uri: "https://github.com",
        folderId,
        encryptedData,
        metadata: { username: "ada@example.com" },
      })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("GitHub");
    resourceId = res.body.id;
  });

  it("lists resources visible to user A", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/resources")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    const found = res.body.find(
      (r: { id: string }) => r.id === resourceId
    );
    expect(found).toBeDefined();
    expect(found.name).toBe("GitHub");
    expect(found.uri).toBe("https://github.com");
  });

  it("user B cannot see user A's resources", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/resources")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(200);

    expect(
      res.body.find((r: { id: string }) => r.id === resourceId)
    ).toBeUndefined();
  });

  it("user B cannot access user A's resource directly", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(404);
  });

  it("gets a single resource metadata", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(res.body.name).toBe("GitHub");
    expect(res.body.metadata.username).toBe("ada@example.com");
  });

  it("fetches and decrypts the secret", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}/secret`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(res.body.encryptedData).toContain("BEGIN PGP MESSAGE");

    const { plaintext } = await decryptMessage(
      res.body.encryptedData,
      userA.privateKeyArmored
    );

    const decoded = JSON.parse(plaintext);
    expect(decoded.username).toBe("ada@example.com");
    expect(decoded.password).toBe("super-secret-123");
  });

  it("attaches a tag to the resource", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/resources/${resourceId}/tags/${tagId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(res.body.tags.length).toBe(1);
    expect(res.body.tags[0].name).toBe("important");
  });

  it("updates resource metadata", async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/resources/${resourceId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ name: "GitHub Personal", uri: "https://github.com/ada" })
      .expect(200);

    expect(res.body.name).toBe("GitHub Personal");
    expect(res.body.uri).toBe("https://github.com/ada");
  });

  it("updates the encrypted secret", async () => {
    const newSecret = JSON.stringify({
      username: "ada@example.com",
      password: "new-password-456",
    });

    const encryptedData = await encryptMessage(
      newSecret,
      [userA.publicKeyArmored]
    );

    await request(app.getHttpServer())
      .put(`/api/v1/resources/${resourceId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ encryptedData })
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}/secret`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    const { plaintext } = await decryptMessage(
      res.body.encryptedData,
      userA.privateKeyArmored
    );

    const decoded = JSON.parse(plaintext);
    expect(decoded.password).toBe("new-password-456");
  });

  it("lists permissions for the resource (OWNER only)", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}/permissions`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(res.body.length).toBe(1);
    expect(res.body[0].level).toBe("OWNER");
  });

  it("user B cannot delete user A's resource", async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/resources/${resourceId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(404);
  });

  it("deletes the resource", async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/resources/${resourceId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(404);
  });

  it("deletes a tag", async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/tags/${tagId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(204);
  });

  it("deletes a folder", async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/folders/${folderId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(204);
  });
});
