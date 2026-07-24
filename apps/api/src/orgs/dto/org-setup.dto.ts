import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsEnum, IsNotEmpty, IsObject, IsString, MaxLength } from "class-validator";

export class OrgSetupDto {
  @ApiProperty({ example: "Acme Inc." })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  orgName!: string;

  @ApiProperty({ enum: ["SELF_HOSTED", "ORGANIZATION"], default: "ORGANIZATION" })
  @IsEnum(["SELF_HOSTED", "ORGANIZATION"])
  mode!: string;

  @ApiProperty({ example: "admin@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Alice" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: "Smith" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ description: "Armored OpenPGP public key" })
  @IsString()
  @IsNotEmpty()
  armoredPublicKey!: string;

  @ApiProperty({ description: "Passphrase-encrypted private key blob (EncryptedBlob JSON)." })
  @IsObject()
  encryptedPrivateKey!: Record<string, unknown>;
}
