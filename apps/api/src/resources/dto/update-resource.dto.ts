import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from "class-validator";

export class UpdateResourceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  uri?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  folderId?: string;

  @ApiPropertyOptional({
    description: "New encrypted secret ciphertext (only if secret changed)",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  encryptedData?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, unknown>;

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
