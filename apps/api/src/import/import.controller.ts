import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ImportService } from "./import.service";

@ApiTags("import")
@Controller("import")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post("csv")
  @ApiOperation({ summary: "Import passwords from CSV file" })
  @UseInterceptors(FileInterceptor("file"))
  async importCsv(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { encryptedEntries: string }
  ) {
    if (!file) {
      return { imported: 0, failed: 0, errors: ["No file uploaded"] };
    }

    const entries = this.importService.parseCsv(file.buffer);
    const encryptedMap: Record<number, string> = JSON.parse(body.encryptedEntries);

    return this.importService.importEntries(
      user.id,
      user.orgId,
      entries,
      async (entry) => {
        const idx = entries.indexOf(entry);
        return encryptedMap[idx] ?? "";
      }
    );
  }

  @Post("bitwarden")
  @ApiOperation({ summary: "Import passwords from Bitwarden JSON export" })
  @UseInterceptors(FileInterceptor("file"))
  async importBitwarden(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { encryptedEntries: string }
  ) {
    if (!file) {
      return { imported: 0, failed: 0, errors: ["No file uploaded"] };
    }

    const entries = this.importService.parseBitwarden(file.buffer);
    const encryptedMap: Record<number, string> = JSON.parse(body.encryptedEntries);

    return this.importService.importEntries(
      user.id,
      user.orgId,
      entries,
      async (entry) => {
        const idx = entries.indexOf(entry);
        return encryptedMap[idx] ?? "";
      }
    );
  }
}
