import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { validateEnv } from "./config/env";

async function bootstrap() {
  try {
    validateEnv(process.env as Record<string, unknown>);
  } catch (error) {
    console.error("❌ Environment validation failed:");
    console.error(error instanceof Error ? error.message : String(error));
    console.error("\nPlease ensure apps/api/.env exists with valid configuration.");
    process.exit(1);
  }

  try {
    const app = await NestFactory.create(AppModule);

    app.use(cookieParser());
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true })
    );
    app.enableCors({
      origin: (process.env.WEB_ORIGIN ?? "http://localhost:3000")
        .split(",")
        .map((o) => o.trim()),
      credentials: true,
    });

    const swaggerConfig = new DocumentBuilder()
      .setTitle("Clickrypt API")
      .setDescription("Zero-knowledge password manager API")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);

    const port = Number(process.env.API_PORT ?? 4001);
    await app.listen(port);
    console.log(`✅ Clickrypt API listening on http://localhost:${port}/api/v1`);
  } catch (error) {
    console.error("❌ Failed to start API server:");
    console.error(error instanceof Error ? error.message : String(error));
    console.error("\nCommon causes:");
    console.error("  - Redis not running (check: docker ps)");
    console.error("  - Database not accessible (check: DATABASE_URL)");
    console.error("  - Port already in use (check: netstat -ano | findstr :4001)");
    process.exit(1);
  }
}

bootstrap();
