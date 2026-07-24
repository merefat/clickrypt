import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { SyncGateway } from "./sync.gateway";

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || "dev-secret-change-in-production",
    }),
  ],
  providers: [SyncGateway],
  exports: [SyncGateway],
})
export class SyncModule {}
