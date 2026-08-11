# IleCzekam

Serwis [ileczekam.pl](https://ileczekam.pl) — pokazuje pacjentom, ile realnie czeka się
na leczenie w ramach NFZ. Dane pochodzą z API „Terminy Leczenia” Narodowego Funduszu Zdrowia.

## Źródło danych (wymóg regulaminowy)

Dane pochodzą z API Narodowego Funduszu Zdrowia — **https://api.nfz.gov.pl/**.

Regulamin API zobowiązuje do informowania o źródle pochodzenia danych przez wskazanie tego
adresu. Informacja musi być widoczna na stronach serwisu, nie tylko w repozytorium.
Regulamin zakazuje też działań mogących doprowadzić do przeciążenia API — obowiązujący limit
to 10 zapytań na sekundę na adres IP; ETL trzyma się throttlingu z `config/settings.yml`
(domyślnie 600 ms, czyli ~1,7 zapytania/s).

## Stan prac

- **Faza A** (rozpoznanie API) — zakończona, wyniki w **[RECON.md](RECON.md)**.
- **Faza B** (ETL: `fetch` + `transform`) — zaimplementowana i uruchomiona na przypadku
  testowym: `ODDZIAŁ KARDIOLOGICZNY` w województwie śląskim.
- Frontend poza stroną startową — do zrobienia.

## Struktura rozwiązania

Clean Architecture (DDD):

| Projekt | Rola |
| --- | --- |
| `IleCzekam.API` | ASP.NET Core Web API — tu będą dodawane kontrolery |
| `IleCzekam.Application` | Warstwa aplikacji (CQRS) |
| `IleCzekam.Domain` | Model domenowy |
| `IleCzekam.Common` | Wspólne narzędzia |
| `IleCzekam.Infrastructure` | Persystencja i integracje |
| `IleCzekam.SharedKernel` | Typy współdzielone między warstwami |
| `IleCzekam.UI` | Frontend Angular (SSG) |
| `Etl/IleCzekam.Etl` | Pipeline ETL czasów oczekiwania (NFZ → raw/processed/serving), CLI `fetch`/`transform` |
| `Etl/IleCzekam.Etl.Tests` | Testy jednostkowe ETL (NUnit) |

## Uruchomienie

- Backend: `dotnet build IleCzekam.sln`, start API: `dotnet run --project IleCzekam.API` (profil `https`).
- Frontend: w `IleCzekam.UI` — `npm install`, potem `npm start` (http://localhost:4200).
- ETL: `make fetch BENEFITS=kardiologia PROVINCES=12`, `make transform`, `make etl-test` —
  instrukcje w [Etl/README.md](Etl/README.md).
- Analityka: `make db` buduje bazę SQLite z tabeli faktów; gotowe zapytania w [queries/](queries/).

## Konfiguracja

```
config/
  settings.yml   # API, throttling, progi walidacji, progi pigułki czasu, kody województw
  benefits.yml   # badane świadczenia + słownik synonimów pacjenta
data/
  raw/           # odpowiedzi API 1:1 — nigdy nie modyfikowane, nigdy nie kasowane
  processed/     # dane po transformacji i walidacji + facts.jsonl (tabela faktów)
  serving/       # finalne JSON-y pod prerender stron
  analytics.sqlite  # baza analityczna (pochodna, odtwarzalna; frontend jej NIE używa)
queries/         # gotowe zapytania SQL: rankingi, udziały procentowe, zmiana m/m
```

Sekrety i identyfikatory klienta idą wyłącznie ze zmiennych środowiskowych — wzorzec
w [.env.example](.env.example). API NFZ nie wymaga klucza ani rejestracji, ale warto
ustawić `NFZ_USER_AGENT` z kontaktem, żeby NFZ mógł się z nami skontaktować.

## Warstwy danych i snapshoty historyczne

API NFZ pokazuje **wyłącznie stan bieżący** — historia powstaje u nas, przez comiesięczne
zachowywanie snapshotów. Warstwa `raw` jest partycjonowana po miesiącu pobrania
(`raw/snapshots/{YYYY-MM}/…`), a pliki `serving` zawierają pole `trend` budowane ze
wszystkich dostępnych snapshotów. Fetch uruchomiony dwa razy w tym samym miesiącu
nadpisuje snapshot tego miesiąca (idempotentność per miesiąc); starsze snapshoty
pozostają nietknięte.
