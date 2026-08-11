import { Routes } from '@angular/router';

import { servingResolver } from '@core/serving/serving.resolver';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('@features/home/home-page').then((m) => m.HomePage),
  },
  {
    path: 'o-danych',
    loadComponent: () => import('@features/about/about-page').then((m) => m.AboutPage),
  },
  {
    // Strona SEO: jedno świadczenie w jednym mieście. Prerenderowana z data/serving.
    path: 'swiadczenie/:benefit/:city',
    loadComponent: () => import('@features/city/city-page').then((m) => m.CityPage),
    resolve: { serving: servingResolver },
  },
];
