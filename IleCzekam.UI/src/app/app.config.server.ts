import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';

import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { FsServingLoader, loadSearchIndex } from '@core/serving/fs-serving-loader';
import { SEARCH_INDEX_LOADER, SERVING_LOADER } from '@core/serving/serving-loader';

// Konfiguracja wyłącznie serwerowa (bundle prerenderu) - tu wolno używać node:fs.
const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: SERVING_LOADER, useClass: FsServingLoader },
    { provide: SEARCH_INDEX_LOADER, useValue: loadSearchIndex },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
