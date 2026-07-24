import { Injectable, Logger } from "@nestjs/common";
import { parse } from "csv-parse/sync";
import { PrismaService } from "../prisma/prisma.service";

export interface ImportEntry {
  name: string;
  uri?: string;
  username?: string;
  password?: string;
  notes?: string;
}

export interface ImportResult {
  imported: number;
  failed: number;
  errors: string[];
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(private readonly prisma: PrismaService) {}

  parseCsv(fileBuffer: Buffer): ImportEntry[] {
    const records: Record<string, string>[] = parse(fileBuffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    return records.map((row) => ({
      name: row.name || row.Name || row.title || row.Title || "Untitled",
      uri: row.uri || row.url || row.URL || undefined,
      username: row.username || row.username || row.login_username || undefined,
      password: row.password || row.password || row.login_password || undefined,
      notes: row.notes || row.Notes || undefined,
    }));
  }

  parseBitwarden(fileBuffer: Buffer): ImportEntry[] {
    const data = JSON.parse(fileBuffer.toString());

    const entries: ImportEntry[] = [];

    if (data.items && Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item.type === 1 && item.login) {
          entries.push({
            name: item.name || "Untitled",
            uri: item.login.uris?.[0]?.uri || undefined,
            username: item.login.username || undefined,
            password: item.login.password || undefined,
            notes: item.notes || undefined,
          });
        }
      }
    }

    return entries;
  }

  async importEntries(
    userId: string,
    orgId: string,
    entries: ImportEntry[],
    encryptFn: (entry: ImportEntry) => Promise<string>
  ): Promise<ImportResult> {
    const resourceType = await this.prisma.resourceType.findUnique({
      where: { name: "password" },
    });
    if (!resourceType) {
      return { imported: 0, failed: entries.length, errors: ["Default resource type not found"] };
    }

    let imported = 0;
    const errors: string[] = [];

    for (const entry of entries) {
      try {
        const secretPayload = JSON.stringify({
          username: entry.username ?? "",
          password: entry.password ?? "",
          notes: entry.notes ?? "",
        });
        const encryptedData = await encryptFn(entry);

        /* eslint-disable @typescript-eslint/no-explicit-any */
        await this.prisma.$transaction(async (tx: any) => {
          const resource = await tx.resource.create({
            data: {
              orgId,
              resourceTypeId: resourceType.id,
              name: entry.name,
              uri: entry.uri ?? null,
              metadataJson: { username: entry.username ?? "" },
              createdBy: userId,
              modifiedBy: userId,
            },
          });

          await tx.secret.create({
            data: {
              resourceId: resource.id,
              userId,
              encryptedData,
            },
          });

          await tx.permission.create({
            data: {
              aroType: "USER",
              aroId: userId,
              acoType: "RESOURCE",
              acoId: resource.id,
              level: "OWNER",
            },
          });
        });
        /* eslint-enable @typescript-eslint/no-explicit-any */

        imported++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed to import "${entry.name}": ${msg}`);
      }
    }

    return { imported, failed: entries.length - imported, errors };
  }
}
