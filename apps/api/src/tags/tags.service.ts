import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateTagDto } from "./dto/tag.dto";

@Injectable()
export class TagsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, dto: CreateTagDto) {
    try {
      return await this.prisma.tag.create({
        data: {
          orgId,
          name: dto.name,
          color: dto.color ?? null,
        },
      });
    } catch {
      throw new ConflictException("Tag name already exists in this org");
    }
  }

  async list(orgId: string) {
    return this.prisma.tag.findMany({
      where: { orgId },
      orderBy: { name: "asc" },
    });
  }

  async delete(orgId: string, id: string) {
    const tag = await this.prisma.tag.findFirst({
      where: { id, orgId },
    });
    if (!tag) {
      throw new NotFoundException("Tag not found");
    }
    await this.prisma.tag.delete({ where: { id } });
  }

  async attachToResource(resourceId: string, tagId: string) {
    try {
      return await this.prisma.resourceTag.create({
        data: { resourceId, tagId },
      });
    } catch {
      throw new ConflictException("Tag already attached or IDs invalid");
    }
  }

  async detachFromResource(resourceId: string, tagId: string) {
    await this.prisma.resourceTag.delete({
      where: { resourceId_tagId: { resourceId, tagId } },
    });
  }
}
