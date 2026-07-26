import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class InitializeDto {
  @ApiPropertyOptional({ enum: ["SELF_HOSTED", "ORGANIZATION"] })
  @IsEnum(["SELF_HOSTED", "ORGANIZATION"])
  @IsOptional()
  mode?: "SELF_HOSTED" | "ORGANIZATION";

  @ApiPropertyOptional()
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  orgName?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  armoredPublicKey!: string;

  @ApiProperty()
  @IsNotEmpty()
  encryptedPrivateKey!: Record<string, unknown>;
}
