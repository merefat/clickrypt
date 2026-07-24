import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateInvitationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ enum: ["USER", "ADMIN"] })
  @IsEnum(["USER", "ADMIN"])
  role!: "USER" | "ADMIN";
}
