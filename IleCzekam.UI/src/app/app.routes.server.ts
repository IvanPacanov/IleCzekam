import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  {
    // Strona startowa celowo CSR — będzie rosnąć w elementy dynamiczne (wyszukiwarka świadczeń).
    // Strony świadczeń (/swiadczenie/:benefit/:miasto) dojdą jako Prerender w fazie B,
    // gdy ETL zacznie produkować data/serving/swiadczenia.
    path: '',
    renderMode: RenderMode.Client,
  },
];
