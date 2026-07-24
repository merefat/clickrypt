import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function loadCrypto() {
  const mod = await import("@clickrypt/crypto");
  return mod as any;
}

async function main() {
  // Default resource types (Phase 1 uses "password" only)
  const resourceTypes = [
    {
      name: "password",
      schemaJson: {
        secret: ["password", "description"],
        metadata: ["name", "username", "uri"],
      },
    },
    { name: "note", schemaJson: { secret: ["note"], metadata: ["name"] } },
    { name: "totp", schemaJson: { secret: ["totpSecret"], metadata: ["name", "issuer"] } },
  ];
  for (const rt of resourceTypes) {
    await prisma.resourceType.upsert({
      where: { name: rt.name },
      update: { schemaJson: rt.schemaJson },
      create: rt,
    });
  }

  // Optional dev admin account for local development after a database reset.
  // Set CLICKRYPT_DEV_ADMIN=true and CLICKRYPT_DEV_ADMIN_PASSPHRASE in your environment.
  if (process.env.CLICKRYPT_DEV_ADMIN === "true") {
    const devEmail = process.env.CLICKRYPT_DEV_ADMIN_EMAIL || "admin@clickrypt.local";
    const devPassphrase = process.env.CLICKRYPT_DEV_ADMIN_PASSPHRASE;
    if (!devPassphrase) {
      console.warn("CLICKRYPT_DEV_ADMIN is true but CLICKRYPT_DEV_ADMIN_PASSPHRASE is not set; skipping dev admin.");
    } else {
      const existing = await prisma.user.findUnique({ where: { email: devEmail } });
      if (!existing) {
        const org = await prisma.organization.create({
          data: { name: "Clickrypt Dev Org", mode: "ORGANIZATION" as any },
        });
        const crypto = await loadCrypto();
        const keyPair = await crypto.generateKeyPair({ name: "Dev Admin", email: devEmail });
        const encryptedPrivateKey = await crypto.encryptWithPassphrase(keyPair.privateKeyArmored, devPassphrase);
        const user = await prisma.user.create({
          data: {
            email: devEmail,
            firstName: "Dev",
            lastName: "Admin",
            role: "USER",
            orgRole: "OWNER",
            status: "ACTIVE",
            orgId: org.id,
          },
        } as any);
        await prisma.gpgKey.create({
          data: {
            userId: user.id,
            publicKey: keyPair.publicKeyArmored,
            fingerprint: keyPair.fingerprint,
            encryptedPrivateKey: encryptedPrivateKey as any,
          },
        });
        await prisma.organizationMembership.create({
          data: {
            organizationId: org.id,
            userId: user.id,
            role: "OWNER",
            status: "ACTIVE",
          },
        } as any);
        console.log(`Created dev admin: ${devEmail}`);
      } else {
        console.log(`Dev admin already exists: ${devEmail}`);
      }

      // Ensure an installation record exists so setup-status reports initialized.
      const existingOrg = await prisma.organization.findFirst({ where: { name: "Clickrypt Dev Org" } });
      if (existingOrg) {
        const existingInstall = await prisma.installation.findFirst({ where: { organizationId: existingOrg.id } });
        if (!existingInstall) {
          await prisma.installation.create({
            data: {
              organizationId: existingOrg.id,
              mode: "ORGANIZATION" as any,
              initializedAt: new Date(),
            },
          });
          console.log("Created installation record.");
        } else {
          console.log("Installation record already exists.");
        }
      }
    }
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
