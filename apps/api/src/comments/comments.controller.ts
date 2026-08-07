import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { CommentsService, CreateCommentDto, UpdateCommentDto } from "./comments.service";
import { AuthenticatedUser, CurrentUser } from "../auth/current-user.decorator";

@ApiTags("comments")
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get("/resources/:id/comments")
  @ApiOperation({ summary: "List comments for a resource" })
  listComments(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.commentsService.list(user.id, id);
  }

  @Post("/resources/:id/comments")
  @ApiOperation({ summary: "Add a comment to a resource" })
  createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateCommentDto
  ) {
    return this.commentsService.create(user.id, id, dto);
  }

  @Put("/comments/:id")
  @ApiOperation({ summary: "Update a comment (author only)" })
  updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCommentDto
  ) {
    return this.commentsService.update(user.id, id, dto);
  }

  @Delete("/comments/:id")
  @ApiOperation({ summary: "Delete a comment" })
  deleteComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.commentsService.delete(user.id, id);
  }
}
