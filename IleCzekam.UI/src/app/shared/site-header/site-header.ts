import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-site-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="site-header">
      <a class="logo" href="/">Ile <span class="logo-accent">czekam</span></a>
      <nav aria-label="Nawigacja główna">
        <!-- Linki-atrapy — pozostałe widoki poza zakresem tego etapu. -->
        <a href="#">Świadczenia</a>
        <a href="#">Miasta</a>
        <a href="#">O danych</a>
      </nav>
    </header>
  `,
  styles: `
    .site-header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
      padding: 1.25rem 0;
      border-bottom: 2px solid var(--color-text);
    }

    .logo {
      font-family: var(--font-serif);
      font-weight: 700;
      font-size: 1.375rem;
      color: var(--color-text);
      text-decoration: none;
    }

    .logo-accent {
      color: var(--color-data);
    }

    nav {
      display: flex;
      gap: 1.25rem;

      a {
        color: var(--color-text);
        text-decoration: none;
        font-weight: 600;
        font-size: 0.9375rem;

        &:hover {
          color: var(--color-data);
          text-decoration: underline;
        }
      }
    }
  `,
})
export class SiteHeader {}
