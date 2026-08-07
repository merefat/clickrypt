import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from "class-validator";

export class CreateFolderDto {
  @ApiProperty({ example: "Work" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: "Parent folder UUID (for nesting)" })
  @IsOptional()
  @IsUUID()
  parentFolderId?: string;

  @ApiPropertyOptional({ description: "Group UUID for group-scoped folders" })
  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export class UpdateFolderDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ description: "Move folder to a new parent (null for root)" })
  @IsOptional()
  @ValidateIf((o: UpdateFolderDto) => o.parentFolderId !== null)
  @IsUUID()
  parentFolderId?: string | null;
}

export class ReorderFolderDto {
  @ApiPropertyOptional({ description: "New parent folder UUID (null for root)" })
  @IsOptional()
  @ValidateIf((o: ReorderFolderDto) => o.parentFolderId !== null)
  @IsUUID()
  parentFolderId?: string | null;

  @ApiProperty({ description: "New sort order among siblings" })
  sortOrder!: number;
}

export class ShareFolderRecipientDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty({ enum: ["READ", "UPDATE", "OWNER"] })
  @IsString()
  permission!: "READ" | "UPDATE" | "OWNER";
}

export class ShareFolderGroupDto {
  @ApiProperty()
  @IsUUID()
  groupId!: string;

  @ApiProperty({ enum: ["READ", "UPDATE"] })
  @IsString()
  permission!: "READ" | "UPDATE";
}

export class ShareFolderDto {
  @ApiPropertyOptional({ type: [ShareFolderRecipientDto] })
  @IsOptional()
  recipients?: ShareFolderRecipientDto[];

  @ApiPropertyOptional({ type: [ShareFolderGroupDto] })
  @IsOptional()
  groupRecipients?: ShareFolderGroupDto[];
}
