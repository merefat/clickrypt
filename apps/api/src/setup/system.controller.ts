import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { SetupService } from "./setup.service";
import { ConfigureSystemDto } from "./dto/configure-system.dto";

@ApiTags("system")
@Controller("system")
export class SystemController {
  constructor(private readonly setupService: SetupService) {}

  @Post("config")
  @HttpCode(201)
  @ApiOperation({ summary: "Persist the deployment mode and organization name before registration" })
  configure(@Body() dto: ConfigureSystemDto) {
    return this.setupService.configureSystem(dto);
  }
}
