import { ApiProperty } from "@nestjs/swagger";
import { IsObject } from "class-validator";

export class UpdatePassphraseDto {
  @ApiProperty({
    description:
      "New passphrase-encrypted private key blob (EncryptedBlob JSON). The server cannot decrypt this.",
    example: {
      version: 1,
      kdf: {
        algorithm: "argon2id",
        salt: "base64-salt",
        memoryKiB: 65536,
        iterations: 3,
        parallelism: 1,
        keyLength: 32,
      },
      iv: "base64-iv",
      ciphertext: "base64-ciphertext",
    },
  })
  @IsObject()
  encryptedPrivateKey: Record<string, unknown>;
}
