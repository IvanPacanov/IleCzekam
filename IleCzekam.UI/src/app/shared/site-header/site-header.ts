import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-site-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="site-header">
      <a
        class="logo"
        href="/"
        >ilecze<span class="logo-accent">kam</span>.pl</a
      >
      <nav aria-label="Nawigacja główna">
        <a href="/o-danych">O danych</a>
      </nav>
    </header>
  `,
  styles: `
    .site-header {
      display: flex;
      align-items: center;
      gap: 28px;
      padding: 18px 48px;
      max-width: 1280px;
      margin: 0 auto;
    }

    .logo {
      font-family: var(--font-display);
      font-size: 22px;
      color: var(--color-text);
      text-decoration: none;
      margin-right: auto;
    }

    .logo-accent {
      color: var(--color-accent-700);
    }

    nav a {
      // Cel dotykowy min. 48px - link w nagłówku też jest klikany kciukiem.
      display: inline-flex;
      align-items: center;
      min-height: var(--touch-target);
      font-size: 17px;
      color: var(--color-text);
      text-decoration: none;

      &:hover {
        color: var(--color-accent-700);
        text-decoration: underline;
      }
    }

    @media (max-width: 900px) {
      .site-header {
        padding: 14px 20px 6px;
      }
    }
  `,
})
export class SiteHeader {}
