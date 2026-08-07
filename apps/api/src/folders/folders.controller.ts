import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateFolderDto, UpdateFolderDto, ReorderFolderDto } from "./dto/folder.dto";
import { FoldersService } from "./folders.service";

@ApiTags("folders")
@Controller("folders")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Post()
  @ApiOperation({ summary: "Create a folder" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFolderDto
  ) {
    return this.foldersService.create(user.id, user.orgId, dto, user.orgRole);
  }

  @Get()
  @ApiOperation({ summary: "List folders in the caller's org" })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.foldersService.list(user.orgId, user.id);
  }

  @Get("groups/:groupId")
  @ApiOperation({ summary: "List folders in a group" })
  listByGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param("groupId", ParseUUIDPipe) groupId: string
  ) {
    return this.foldersService.listByGroup(user.orgId, user.id, groupId);
  }

  @Put(":id")
  @ApiOperation({ summary: "Rename a folder" })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateFolderDto
  ) {
    return this.foldersService.update(user.id, user.orgId, id, dto, user.orgRole);
  }

  @Put(":id/reorder")
  @ApiOperation({ summary: "Reorder or move a folder" })
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReorderFolderDto
  ) {
    return this.foldersService.reorder(user.id, user.orgId, id, dto, user.orgRole);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a folder" })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    await this.foldersService.delete(user.id, user.orgId, id, user.orgRole);
  }
}
