import { ChangeDetectionStrategy, Component } from '@angular/core';

import { SiteHeader } from '@shared/site-header/site-header';

/** Widok 5 - „O danych”. Statyczna, prerenderowana strona wyjaśniająca metodologię. */
@Component({
  selector: 'app-about-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SiteHeader],
  templateUrl: './about-page.html',
  styleUrl: './about-page.scss',
})
export class AboutPage {}
