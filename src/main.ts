import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { envVars } from './config';

async function bootstrap() {
  const logger = new Logger('Payments Microservice');
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(envVars.PORT);

  logger.log(`Payments Microservice running on PORT ${envVars.PORT}`);
}
bootstrap();
