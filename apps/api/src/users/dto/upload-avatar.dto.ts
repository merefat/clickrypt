import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class UploadAvatarDto {
  @ApiProperty({
    description: "Base64 data URI of the avatar image (max 2MB decoded).",
    example: "data:image/jpeg;base64,/9j/4AAQ...",
  })
  @IsString()
  @Matches(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/, {
    message: "avatarBase64 must be a valid data URI (data:image/...;base64,...)",
  })
  avatarBase64!: string;
}
