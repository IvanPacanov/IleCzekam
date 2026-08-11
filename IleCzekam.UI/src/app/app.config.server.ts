import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

// Konfiguracja wyłącznie serwerowa (bundle prerenderu) — tu wolno używać node:fs.
// Faza B doda tu loader danych świadczeń czytany z data/serving w czasie builda.
const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes))],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
