import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateOrgDto {
  @ApiProperty({ enum: ["SELF_HOSTED", "ORGANIZATION"] })
  @IsEnum(["SELF_HOSTED", "ORGANIZATION"])
  mode!: "SELF_HOSTED" | "ORGANIZATION";

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;
}
