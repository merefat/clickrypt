import { IsNumber, IsOptional, IsUUID } from "class-validator";

export class ReorderResourceDto {
  @IsOptional()
  @IsUUID()
  folderId?: string;

  @IsNumber()
  sortOrder!: number;
}
