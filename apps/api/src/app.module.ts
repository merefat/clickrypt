import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AdminModule } from "./admin/admin.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CommonModule } from "./common/common.module";
import { EmailQueueModule } from "./email-queue/email-queue.module";
import { FoldersModule } from "./folders/folders.module";
import { GroupsModule } from "./groups/groups.module";
import { HealthModule } from "./health/health.module";
import { ImportModule } from "./import/import.module";
import { InstallationsModule } from "./installations/installations.module";
import { InvitationsModule } from "./invitations/invitations.module";
import { MailModule } from "./mail/mail.module";
import { MembershipsModule } from "./memberships/memberships.module";
import { MfaModule } from "./mfa/mfa.module";
import { OrgsModule } from "./orgs/orgs.module";
import { PermissionsModule } from "./permissions/permissions.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RedisModule } from "./redis/redis.module";
import { ResourcesModule } from "./resources/resources.module";
import { SetupModule } from "./setup/setup.module";
import { SyncModule } from "./sync/sync.module";
import { TagsModule } from "./tags/tags.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["apps/api/.env", ".env"] }),
    PrismaModule,
    RedisModule,
    CommonModule,
    InstallationsModule,
    MailModule,
    EmailQueueModule,
    SyncModule,
    AuthModule,
    UsersModule,
    PermissionsModule,
    ResourcesModule,
    FoldersModule,
    TagsModule,
    GroupsModule,
    ImportModule,
    MfaModule,
    AdminModule,
    AuditModule,
    OrgsModule,
    SetupModule,
    MembershipsModule,
    InvitationsModule,
    HealthModule,
  ],
})
export class AppModule {}
