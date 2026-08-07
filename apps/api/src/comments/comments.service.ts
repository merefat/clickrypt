import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionsService } from "../permissions/permissions.service";

export interface CreateCommentDto {
  content: string;
}

export interface UpdateCommentDto {
  content: string;
}

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService
  ) {}

  private async checkRead(userId: string, resourceId: string) {
    const perm = await this.permissions.resolveForResource(userId, resourceId);
    if (!perm) throw new NotFoundException("Resource not found");
    return perm;
  }

  async list(userId: string, resourceId: string) {
    await this.checkRead(userId, resourceId);
    const comments = await this.prisma.comment.findMany({
      where: { resourceId },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, avatarBase64: true } } },
    });
    return comments;
  }

  async create(userId: string, resourceId: string, dto: CreateCommentDto) {
    await this.checkRead(userId, resourceId);
    const comment = await this.prisma.comment.create({
      data: { resourceId, userId, content: dto.content },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, avatarBase64: true } } },
    });
    return comment;
  }

  async update(userId: string, id: string, dto: UpdateCommentDto) {
    const comment = await this.prisma.comment.findUnique({ where: { id } });
    if (!comment) throw new NotFoundException("Comment not found");
    await this.checkRead(userId, comment.resourceId);
    if (comment.userId !== userId) {
      throw new ForbiddenException("Only the author can edit a comment");
    }
    return this.prisma.comment.update({
      where: { id },
      data: { content: dto.content, editedAt: new Date() },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, avatarBase64: true } } },
    });
  }

  async delete(userId: string, id: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id },
      include: { resource: { select: { ownerId: true } } },
    });
    if (!comment) throw new NotFoundException("Comment not found");
    const perm = await this.checkRead(userId, comment.resourceId);
    const canDelete =
      comment.userId === userId ||
      comment.resource.ownerId === userId ||
      this.permissions.hasAtLeast(perm, "OWNER");
    if (!canDelete) {
      throw new ForbiddenException("Only the author, resource owner, or an admin can delete a comment");
    }
    await this.prisma.comment.delete({ where: { id } });
  }
}
