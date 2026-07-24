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
    email,
    publicKeyArmored: keypair.publicKeyArmored,
    privateKeyArmored,
  };
}

async function createResource(
  app: INestApplication,
  accessToken: string,
  publicKeyArmored: string,
  name: string
) {
  const secretPayload = JSON.stringify({ username: "user@test.com", password: "pass123" });
  const encryptedData = await encryptMessage(secretPayload, [publicKeyArmored]);

  const res = await request(app.getHttpServer())
    .post("/api/v1/resources")
    .set("Authorization", `Bearer ${accessToken}`)
    .send({ name, encryptedData, metadata: { username: "user@test.com" } })
    .expect(201);

  return res.body.id as string;
}

describe("Groups + Favorites e2e", () => {
  let app: INestApplication;
  let userA: { accessToken: string; userId: string; publicKeyArmored: string; privateKeyArmored: string };
  let userB: { accessToken: string; userId: string; publicKeyArmored: string; privateKeyArmored: string };
  let groupId: string;
  let resourceId: string;

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

    userA = await registerAndLogin(app, uniqueEmail("grp-a"), PASSPHRASE);
    userB = await registerAndLogin(app, uniqueEmail("grp-b"), PASSPHRASE);
  });

  afterAll(async () => {
    await cleanupTestInviter();
    await disconnectTestPrisma();
    await app?.close();
  });

  it("user A creates a group", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ name: "Engineering Team" })
      .expect(201);

    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Engineering Team");
    groupId = res.body.id;
  });

  it("user A lists groups", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/groups")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.some((g: { id: string }) => g.id === groupId)).toBe(true);
  });

  it("user A adds user B as a group member", async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/groups/${groupId}/members`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ email: userB.email, role: "USER" })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/groups/${groupId}/members`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(res.body.some((m: { userId: string }) => m.userId === userB.userId)).toBe(true);
  });

  it("user A creates a resource and shares with the group", async () => {
    resourceId = await createResource(app, userA.accessToken, userA.publicKeyArmored, "Shared via Group");

    const secretPayload = JSON.stringify({ username: "grp@test.com", password: "grp-pass" });
    const encryptedForB = await encryptMessage(secretPayload, [userB.publicKeyArmored]);

    await request(app.getHttpServer())
      .post(`/api/v1/resources/${resourceId}/share`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        groupRecipients: [
          { groupId, permission: "READ", memberSecrets: { [userB.userId]: encryptedForB } },
        ],
      })
      .expect(200);
  });

  it("user B can see the group-shared resource", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/resources")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(200);

    expect(res.body.some((r: { id: string }) => r.id === resourceId)).toBe(true);
  });

  it("user B can retrieve and decrypt the shared secret", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}/secret`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(200);

    const { plaintext } = await decryptMessage(res.body.encryptedData, userB.privateKeyArmored);
    const secret = JSON.parse(plaintext);
    expect(secret.username).toBe("grp@test.com");
    expect(secret.password).toBe("grp-pass");
  });

  it("user A toggles favorite on the resource", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/resources/${resourceId}/favorite`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(201);

    expect(res.body.isFavorite).toBe(true);
  });

  it("user A sees isFavorite in resource list", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/resources")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    const item = res.body.find((r: { id: string }) => r.id === resourceId);
    expect(item).toBeDefined();
    expect(item.isFavorite).toBe(true);
  });

  it("user A un-favorites the resource", async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/resources/${resourceId}/favorite`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(201);

    expect(res.body.isFavorite).toBe(false);
  });

  it("user A revokes group share", async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/resources/${resourceId}/share/group/${groupId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(204);

    // User B should no longer see the resource
    const res = await request(app.getHttpServer())
      .get("/api/v1/resources")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(200);

    expect(res.body.some((r: { id: string }) => r.id === resourceId)).toBe(false);
  });

  it("user A removes user B from group", async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/groups/${groupId}/members/${userB.userId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(204);
  });

  it("user A deletes the group", async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/groups/${groupId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(204);

    const res = await request(app.getHttpServer())
      .get("/api/v1/groups")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(res.body.some((g: { id: string }) => g.id === groupId)).toBe(false);
  });

  it("user A creates a new group for cleanup test", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/groups")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ name: "Cleanup Test Group" })
      .expect(201);

    groupId = res.body.id;

    await request(app.getHttpServer())
      .post(`/api/v1/groups/${groupId}/members`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ email: userB.email, role: "USER" })
      .expect(201);
  });

  it("user A creates a resource and shares with the cleanup group", async () => {
    resourceId = await createResource(app, userA.accessToken, userA.publicKeyArmored, "Cleanup Test Resource");

    const secretPayload = JSON.stringify({ username: "cleanup@test.com", password: "cleanup-pass" });
    const encryptedForB = await encryptMessage(secretPayload, [userB.publicKeyArmored]);

    await request(app.getHttpServer())
      .post(`/api/v1/resources/${resourceId}/share`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({
        groupRecipients: [
          {
            groupId,
            permission: "READ",
            memberSecrets: {
              [userB.userId]: encryptedForB,
            },
          },
        ],
      })
      .expect(200);
  });

  it("user B can access the resource via group", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/resources")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(200);

    expect(res.body.some((r: { id: string }) => r.id === resourceId)).toBe(true);
  });

  it("user A deletes the cleanup group", async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/groups/${groupId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(204);
  });

  it("user B loses secret access after group deletion", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}/secret`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .expect(404);
  });

  it("group permission is cleaned up", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/resources/${resourceId}/permissions`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .expect(200);

    expect(res.body.some((p: { aroType: string }) => p.aroType === "GROUP")).toBe(false);
  });
});
