import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class CreateResourceDto {
  @ApiProperty({ example: "GitHub" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ example: "https://github.com" })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  uri?: string;

  @ApiPropertyOptional({ description: "Folder UUID" })
  @IsOptional()
  @IsUUID()
  folderId?: string;

  @ApiPropertyOptional({ description: "Group UUID for group-scoped resources" })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiProperty({
    description: "OpenPGP-encrypted secret ciphertext (armored) for the caller",
  })
  @IsString()
  @IsNotEmpty()
  encryptedData!: string;

  @ApiPropertyOptional({
    description: "Additional metadata JSON (username, notes, etc.)",
  })
  @IsOptional()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional({ example: "password", description: "Resource type name (password, note, totp)" })
  @IsOptional()
  @IsString()
  resourceType?: string;

  @ApiPropertyOptional({
    description: "Map of userId → encrypted secret for auto-sharing to org members",
  })
  @IsOptional()
  additionalSecrets?: Record<string, string>;

  @ApiPropertyOptional({ enum: ["AUTO", "RESTRICTED"], description: "Sharing mode — AUTO shares with all org members, RESTRICTED lets owner choose" })
  @IsOptional()
  @IsEnum(["AUTO", "RESTRICTED"])
  sharingMode?: "AUTO" | "RESTRICTED";
}
