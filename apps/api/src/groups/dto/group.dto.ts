import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateGroupDto {
  @ApiProperty({ example: "Engineering" })
  @IsString()
  @IsNotEmpty()
  name!: string;
}

export class UpdateGroupDto {
  @ApiProperty({ example: "Engineering Team" })
  @IsString()
  @IsOptional()
  name?: string;
}

export class SetGroupKeyDto {
  @ApiProperty({ description: "User UUID who will receive the encrypted group key" })
  @IsUUID()
  userId!: string;

  @ApiProperty({ description: "Armored OpenPGP ciphertext wrapping the group symmetric key" })
  @IsString()
  @IsNotEmpty()
  encryptedGroupKey!: string;

  @ApiPropertyOptional({ description: "Raw base64 group symmetric key — stored server-side for auto-distribution to new members" })
  @IsOptional()
  @IsString()
  rawGroupKey?: string;
}

export class AddGroupMemberDto {
  @ApiProperty({ example: "member@example.com" })
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: "USER", enum: ["OWNER", "ADMIN", "USER"] })
  @IsString()
  @IsIn(["OWNER", "ADMIN", "USER"])
  role!: "OWNER" | "ADMIN" | "USER";
}
