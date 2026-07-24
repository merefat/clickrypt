import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsHexColor,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class CreateTagDto {
  @ApiProperty({ example: "work" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;

  @ApiPropertyOptional({ example: "#3b82f6" })
  @IsOptional()
  @IsHexColor()
  color?: string;
}
