import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
    } catch (error) {
      this.logger.warn(
        `Database unreachable at startup — API will report degraded health until it is available. (${(error as Error).message?.split("\n")[0]})`
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
