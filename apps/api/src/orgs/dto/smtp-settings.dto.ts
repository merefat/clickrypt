import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min, Max } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateSmtpSettingsDto {
  @ApiProperty({ example: "smtp.gmail.com" })
  @IsString()
  @IsNotEmpty()
  smtpHost!: string;

  @ApiProperty({ example: 587 })
  @IsNumber()
  @Min(1)
  @Max(65535)
  smtpPort!: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @ApiProperty({ example: "your@gmail.com" })
  @IsString()
  @IsNotEmpty()
  smtpUser!: string;

  @ApiProperty({ example: "your-app-password" })
  @IsString()
  @IsNotEmpty()
  smtpPass!: string;

  @ApiPropertyOptional({ example: "Clickrypt <no-reply@clickrypt.local>" })
  @IsOptional()
  @IsString()
  smtpFrom?: string;

  @ApiProperty({ example: "https://your-public-url.com" })
  @IsString()
  @IsNotEmpty()
  appUrl!: string;
}
