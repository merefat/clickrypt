import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class InviteMemberDto {
  @ApiProperty({ example: "bob@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ enum: ["USER", "ADMIN"], default: "USER" })
  @IsEnum(["USER", "ADMIN"])
  role!: string;
}

export class UpdateMemberRoleDto {
  @ApiProperty({ enum: ["USER", "ADMIN"] })
  @IsEnum(["USER", "ADMIN"])
  role!: string;
}

export class AcceptInviteDto {
  @ApiProperty({ example: "Bob" })
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

  @ApiProperty({
    description: "Passphrase-encrypted private key blob (EncryptedBlob JSON).",
  })
  @IsNotEmpty()
  encryptedPrivateKey!: Record<string, unknown>;
}
