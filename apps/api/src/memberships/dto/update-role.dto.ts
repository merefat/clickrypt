import { IsEnum } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateRoleDto {
  @ApiProperty({ enum: ["USER", "ADMIN"] })
  @IsEnum(["USER", "ADMIN"])
  role!: "USER" | "ADMIN";
}
