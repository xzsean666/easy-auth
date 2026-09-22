import { Module, DynamicModule, Provider, Global } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { EASY_AUTH_OPTIONS } from "./constants.js";
import { EasyAuthService, type EasyAuthModuleOptions } from "./easy-auth.service.js";
import { EasyAuthController } from "./easy-auth.controller.js";
import { EasyAuthGuard } from "./easy-auth.guard.js";

export interface EasyAuthModuleAsyncOptions {
  imports?: any[];
  useFactory: (...args: any[]) => Promise<EasyAuthModuleOptions> | EasyAuthModuleOptions;
  inject?: any[];
}

@Global()
@Module({})
export class EasyAuthModule {
  /**
   * Synchronous static registration of EasyAuthModule.
   */
  static forRoot(options: EasyAuthModuleOptions): DynamicModule {
    if (options.routePrefix) {
      const cleanPrefix = options.routePrefix.replace(/^\/+|\/+$/g, "");
      Reflect.defineMetadata("path", cleanPrefix, EasyAuthController);
    }

    const controllers = options.disableController ? [] : [EasyAuthController];

    const providers: Provider[] = [
      {
        provide: EASY_AUTH_OPTIONS,
        useValue: options,
      },
      EasyAuthService,
      EasyAuthGuard,
    ];

    if (options.globalGuard) {
      providers.push({
        provide: APP_GUARD,
        useClass: EasyAuthGuard,
      });
    }

    return {
      module: EasyAuthModule,
      controllers,
      providers,
      exports: [EasyAuthService, EasyAuthGuard],
    };
  }

  /**
   * Asynchronous registration of EasyAuthModule using factory function.
   */
  static forRootAsync(asyncOptions: EasyAuthModuleAsyncOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: EASY_AUTH_OPTIONS,
        useFactory: asyncOptions.useFactory,
        inject: asyncOptions.inject || [],
      },
      EasyAuthService,
      EasyAuthGuard,
    ];

    return {
      module: EasyAuthModule,
      imports: asyncOptions.imports || [],
      controllers: [EasyAuthController],
      providers,
      exports: [EasyAuthService, EasyAuthGuard],
    };
  }
}
