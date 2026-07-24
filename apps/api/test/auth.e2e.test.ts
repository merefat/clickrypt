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
  encryptWithPassphrase,
  generateKeyPair,
  type EncryptedBlob,
} from "@clickrypt/crypto";

const FAST_KDF = { memoryKiB: 1024, iterations: 1, parallelism: 1 };

const TEST_EMAIL = `e2e-${Date.now()}@clickrypt.test`;
const PASSPHRASE = "correct horse battery staple";

describe("Auth e2e (register → verify → login → refresh → logout)", () => {
  let app: INestApplication;
  let keypair: { publicKeyArmored: string; privateKeyArmored: string; fingerprint: string };
  let encryptedPrivateKey: EncryptedBlob;
  let accessToken: string;
  let refreshCookie: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    keypair = await generateKeyPair({
      name: "E2E Test",
      email: TEST_EMAIL,
    });
    encryptedPrivateKey = await encryptWithPassphrase(
      keypair.privateKeyArmored,
      PASSPHRASE,
      FAST_KDF
    );
  });

  afterAll(async () => {
    await cleanupTestInviter();
    await disconnectTestPrisma();
    await app?.close();
  });

  it("registers a new user with a public key + encrypted private key", async () => {
    await createTestInvite(TEST_EMAIL);
    const res = await request(app.getHttpServer())
      .post("/api/v1/users/register")
      .send({
        email: TEST_EMAIL,
        firstName: "E2E",
        lastName: "Test",
        armoredPublicKey: keypair.publicKeyArmored,
        encryptedPrivateKey,
      })
      .expect(201);

    expect(res.body.email).toBe(TEST_EMAIL);
    expect(res.body.fingerprint).toBe(keypair.fingerprint);
    expect(res.body.status).toBe("ACTIVE");
  });

  it("rejects duplicate registration (invite already consumed)", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/users/register")
      .send({
        email: TEST_EMAIL,
        firstName: "E2E",
        lastName: "Test",
        armoredPublicKey: keypair.publicKeyArmored,
        encryptedPrivateKey,
      })
      .expect(403);
  });

  it("returns a challenge encrypted to the user's public key", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/verify")
      .send({ email: TEST_EMAIL })
      .expect(200);

    expect(res.body.challenge).toContain("BEGIN PGP MESSAGE");
    expect(res.body.encryptedPrivateKey).toBeDefined();
    expect(res.body.fingerprint).toBe(keypair.fingerprint);
  });

  it("completes login with the decrypted challenge token", async () => {
    // Step 1: get challenge
    const verifyRes = await request(app.getHttpServer())
      .post("/api/v1/auth/verify")
      .send({ email: TEST_EMAIL })
      .expect(200);

    // Step 2: decrypt the private key with the passphrase
    const privateKeyArmored = await decryptWithPassphrase(
      verifyRes.body.encryptedPrivateKey,
      PASSPHRASE
    );

    // Step 3: decrypt the challenge to get the token
    const { plaintext: token } = await decryptMessage(
      verifyRes.body.challenge,
      privateKeyArmored
    );

    // Step 4: submit the token to login
    const loginRes = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: TEST_EMAIL, token })
      .expect(200);

    expect(loginRes.body.accessToken).toBeDefined();
    expect(loginRes.body.mfaRequired).toBe(false);
    expect(loginRes.body.user.email).toBe(TEST_EMAIL);

    accessToken = loginRes.body.accessToken;
    const cookies = loginRes.headers["set-cookie"] as unknown as string[];
    const refresh = cookies?.find((c) => c.startsWith("clickrypt_refresh="));
    expect(refresh).toBeDefined();
    refreshCookie = refresh!;
  });

  it("GET /users/me returns the authenticated user's profile", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.email).toBe(TEST_EMAIL);
    expect(res.body.fingerprint).toBe(keypair.fingerprint);
  });

  it("rejects /users/me without a token", async () => {
    await request(app.getHttpServer()).get("/api/v1/users/me").expect(401);
  });

  it("rotates the refresh token and issues a new access token", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(200);

    expect(res.body.accessToken).toBeDefined();
    expect(res.body.accessToken).not.toBe(accessToken);
    accessToken = res.body.accessToken;

    const cookies = res.headers["set-cookie"] as unknown as string[];
    const newRefresh = cookies?.find((c) => c.startsWith("clickrypt_refresh="));
    expect(newRefresh).toBeDefined();
    refreshCookie = newRefresh!;
  });

  it("detects refresh token reuse and revokes the session", async () => {
    // Rotate once more — update state so logout uses the latest token
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/refresh")
      .set("Cookie", refreshCookie)
      .expect(200);

    accessToken = res.body.accessToken;
    const cookies = res.headers["set-cookie"] as unknown as string[];
    const newRefresh = cookies?.find((c) => c.startsWith("clickrypt_refresh="));
    expect(newRefresh).toBeDefined();
    refreshCookie = newRefresh!;
  });

  it("logs out and revokes the session", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", refreshCookie)
      .expect(204);

    // The access token should no longer work (session revoked)
    await request(app.getHttpServer())
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${accessToken}`)
      .expect(401);
  });

  it("returns a decoy challenge for unknown emails (no enumeration)", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/verify")
      .send({ email: "nonexistent@clickrypt.test" })
      .expect(200);

    expect(res.body.challenge).toContain("BEGIN PGP MESSAGE");
    expect(res.body.encryptedPrivateKey).toBeDefined();
    expect(res.body.fingerprint).toMatch(/^[0-9A-F]{40}$/);
  });

  it("login fails for unknown email", async () => {
    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: "nonexistent@clickrypt.test", token: "fake-token" })
      .expect(401);
  });
});
