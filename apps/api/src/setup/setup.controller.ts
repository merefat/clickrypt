import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SetupService } from "./setup.service";
import { InitializeDto } from "./dto/initialize.dto";

@ApiTags("setup")
@Controller("setup")
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get("status")
  @ApiOperation({ summary: "Check if the installation has been initialized" })
  getStatus() {
    return this.setupService.getStatus();
  }

  @Post("initialize")
  @HttpCode(201)
  @ApiOperation({ summary: "Initialize the installation (first-run setup)" })
  initialize(@Body() dto: InitializeDto) {
    return this.setupService.initialize(dto);
  }
}
