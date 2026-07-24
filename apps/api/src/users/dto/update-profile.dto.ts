import { ApiProperty } from "@nestjs/swagger";
import {
  IsOptional,
  IsString,
  MaxLength,
  Matches,
} from "class-validator";

export class UpdateProfileDto {
  @ApiProperty({ example: "Ada", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiProperty({ example: "Lovelace", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ example: "Senior Engineer", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  jobTitle?: string;

  @ApiProperty({ example: "+1-555-0100", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @ApiProperty({ example: "Passionate about security.", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bio?: string;

  @ApiProperty({ example: "America/New_York", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  timezone?: string;

  @ApiProperty({
    description: "Base64 data URI of the avatar image (max 2MB decoded).",
    example: "data:image/jpeg;base64,/9j/4AAQ...",
    required: false,
  })
  @IsOptional()
  @IsString()
  @Matches(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/, {
    message: "avatarBase64 must be a valid data URI (data:image/...;base64,...)",
  })
  avatarBase64?: string;
}
