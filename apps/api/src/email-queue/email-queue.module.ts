import { Global, Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { EmailService } from "./email.service";
import { EmailProcessor } from "./email.processor";
import { OrgsModule } from "../orgs/orgs.module";

@Global()
@Module({
  imports: [
    BullModule.registerQueue({
      name: "email-queue",
      connection: {
        url: process.env.REDIS_URL ?? "redis://localhost:6379",
      },
    }),
    OrgsModule,
  ],
  providers: [EmailService, EmailProcessor],
  exports: [EmailService],
})
export class EmailQueueModule {}
