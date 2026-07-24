import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsObject, IsString } from "class-validator";

export class SyncGroupSecretsDto {
  @ApiProperty({
    description: "Map of resourceId -> encrypted secret ciphertext for the target user",
    example: { "resource-uuid": "-----BEGIN PGP MESSAGE-----..." },
  })
  @IsObject()
  @IsNotEmpty()
  resourceShares!: Record<string, string>;
}
