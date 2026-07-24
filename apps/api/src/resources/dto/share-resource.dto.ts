import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsArray, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from "class-validator";

export class ShareRecipientDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ enum: ["READ", "UPDATE"] })
  @IsIn(["READ", "UPDATE"])
  permission!: string;

  @ApiProperty({ description: "OpenPGP-encrypted secret ciphertext for this recipient" })
  @IsString()
  @IsNotEmpty()
  encryptedData!: string;
}

export class GroupShareRecipientDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  groupId!: string;

  @ApiProperty({ enum: ["READ", "UPDATE"] })
  @IsIn(["READ", "UPDATE"])
  permission!: string;

  @ApiProperty({
    description: "Per-member encrypted secrets: { userId: encryptedData }",
    type: "object",
  })
  @IsObject()
  memberSecrets!: Record<string, string>;
}

export class ShareResourceDto {
  @ApiProperty({ type: [ShareRecipientDto], required: false })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ShareRecipientDto)
  recipients?: ShareRecipientDto[];

  @ApiProperty({ type: [GroupShareRecipientDto], required: false })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => GroupShareRecipientDto)
  groupRecipients?: GroupShareRecipientDto[];
}
