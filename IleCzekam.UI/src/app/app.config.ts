import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideClientHydration } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';

// Bez provideHttpClient — dane gmin są czytane z dysku w czasie prerenderu
// i przekazywane przez TransferState; przeglądarka nie robi żadnych requestów o dane.
export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    // Bez withViewTransitions — jeden widok w tym etapie, animacje tras to zbędne kB.
    provideRouter(routes, withComponentInputBinding()),
    provideClientHydration()
  ]
};
