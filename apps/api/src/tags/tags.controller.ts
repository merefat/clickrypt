import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser, type AuthenticatedUser } from "../auth/current-user.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateTagDto } from "./dto/tag.dto";
import { TagsService } from "./tags.service";

@ApiTags("tags")
@Controller("tags")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Post()
  @ApiOperation({ summary: "Create an org-scoped tag" })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTagDto
  ) {
    return this.tagsService.create(user.orgId, dto);
  }

  @Get()
  @ApiOperation({ summary: "List tags in the caller's org" })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.tagsService.list(user.orgId);
  }

  @Delete(":id")
  @HttpCode(204)
  @ApiOperation({ summary: "Delete a tag" })
  async delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    await this.tagsService.delete(user.orgId, id);
  }
}
