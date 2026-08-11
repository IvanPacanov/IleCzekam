import { RenderMode, ServerRoute } from '@angular/ssr';

import { listCityRoutes } from '@core/serving/fs-serving-loader';

export const serverRoutes: ServerRoute[] = [
  {
    // Strona startowa celowo CSR - wyszukiwarka jest dynamiczna i dociąga indeks świadczeń.
    path: '',
    renderMode: RenderMode.Client,
  },
  {
    path: 'o-danych',
    renderMode: RenderMode.Prerender,
  },
  {
    // Lista tras powstaje z plików w data/serving/swiadczenia - jedna strona na (świadczenie, miasto).
    path: 'swiadczenie/:benefit/:city',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => listCityRoutes(),
  },
];
