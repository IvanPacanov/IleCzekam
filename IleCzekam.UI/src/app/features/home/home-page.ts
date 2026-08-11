import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SiteHeader } from '@shared/site-header/site-header';

/**
 * Strona startowa — renderowana po stronie klienta (RenderMode.Client
 * w app.routes.server.ts): tu będą przybywać elementy dynamiczne
 * (wyszukiwarka świadczeń i miast, zasilana indeksem z ETL).
 */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiteHeader],
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
})
export class HomePage {}
