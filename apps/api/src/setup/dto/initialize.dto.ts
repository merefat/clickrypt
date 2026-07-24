import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class InitializeDto {
  @ApiProperty({ enum: ["SELF_HOSTED", "ORGANIZATION"] })
  @IsEnum(["SELF_HOSTED", "ORGANIZATION"])
  mode!: "SELF_HOSTED" | "ORGANIZATION";

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  orgName!: string;

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
