import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration, configurationSchema } from './config';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: configurationSchema,
      cache: true,
    }),
  ],
  exports: [ConfigModule],
})
export class SharedModule {}
