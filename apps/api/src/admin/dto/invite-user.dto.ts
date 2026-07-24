import { ApiProperty } from "@nestjs/swagger";
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export class InviteUserDto {
  @ApiProperty({ example: "ada@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Ada", required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiProperty({ example: "Lovelace", required: false })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ enum: ["USER", "MANAGER", "ORG_ADMIN"], default: "USER" })
  @IsEnum(["USER", "MANAGER", "ORG_ADMIN"])
  role!: string;
}

export class AddMemberDto {
  @ApiProperty({ example: "ada@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "Ada" })
  @IsString()
  @MaxLength(100)
  firstName!: string;

  @ApiProperty({ example: "Lovelace" })
  @IsString()
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ enum: ["USER", "ADMIN"], default: "USER" })
  @IsEnum(["USER", "ADMIN"])
  role!: string;

  @ApiProperty({ required: false, description: "Temporary password for the new member" })
  @IsString()
  @IsOptional()
  @MinLength(8)
  password?: string;
}
