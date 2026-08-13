import { Routes } from '@angular/router';

import { searchIndexResolver } from '@core/serving/search-index.resolver';
import { servingResolver } from '@core/serving/serving.resolver';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('@features/home/home-page').then((m) => m.HomePage),
  },
  {
    // Widok wyników - dynamiczny (geolokalizacja, filtry), więc CSR jak strona główna.
    path: 'szukaj',
    loadComponent: () => import('@features/search/search-page').then((m) => m.SearchPage),
  },
  {
    path: 'o-danych',
    loadComponent: () => import('@features/about/about-page').then((m) => m.AboutPage),
  },
  {
    // Strona SEO: jedno świadczenie w jednym mieście. Prerenderowana z data/serving.
    path: 'swiadczenie/:benefit/:city',
    loadComponent: () => import('@features/city/city-page').then((m) => m.CityPage),
    resolve: { serving: servingResolver, searchIndex: searchIndexResolver },
  },
];
