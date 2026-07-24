import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class VerifyDto {
  @ApiProperty({ example: "ada@example.com" })
  @IsEmail()
  email!: string;
}

export class LoginDto {
  @ApiProperty({ example: "ada@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: "The challenge token, decrypted with the user's private key",
  })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
