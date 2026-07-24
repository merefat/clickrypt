import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
} from "class-validator";

export class RegisterUserDto {
  @ApiProperty({ example: "ada@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Ada" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: "Lovelace" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ description: "Armored OpenPGP public key" })
  @IsString()
  @IsNotEmpty()
  armoredPublicKey!: string;

  @ApiProperty({
    description:
      "Passphrase-encrypted private key blob (EncryptedBlob JSON from @clickrypt/crypto). The server can never decrypt this.",
  })
  @IsObject()
  encryptedPrivateKey!: Record<string, unknown>;
}
