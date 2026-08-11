# ETL czasów oczekiwania NFZ (Terminy Leczenia → ileczekam.pl)

Pipeline pobiera kolejki oczekujących z API NFZ „Terminy Leczenia”
(https://apinfz.nfz.gov.pl/app-itl-api-pcus/), mapuje prognozowany czas udzielenia
świadczenia (PCUŚ) na czytelną dla pacjenta „pigułkę” i generuje pliki JSON pod frontend.

**Stan: szkielet.** Faza A (rozpoznanie API) jest zakończona — patrz [RECON.md](../RECON.md).
Faza B (właściwa implementacja `fetch` i `transform`) czeka na akceptację RECON.md. Dziś oba
polecenia walidują konfigurację i kończą się komunikatem „faza B”.

## Dostęp do API

API NFZ jest publiczne — **nie wymaga rejestracji ani klucza**. Regulamin wymaga natomiast:

1. informowania o źródle danych przez wskazanie adresu `https://api.nfz.gov.pl/`,
2. nieprzeciążania API — limit **10 zapytań na sekundę na adres IP**.

Skopiuj `.env.example` do `.env` i ustaw `NFZ_USER_AGENT` z adresem kontaktowym.
`.env` jest w `.gitignore` i nie trafia do repo.

## Uruchamianie

Z katalogu głównego repozytorium (tam gdzie `config/` i `data/`):

```bash
make fetch BENEFITS=kardiologia PROVINCES=12   # NFZ -> data/raw/snapshots/{YYYY-MM} (sieć)
make transform                                  # data/raw + config -> processed + serving (bez sieci)
make etl-test                                   # testy jednostkowe (bez prawdziwego API)
```

lub bezpośrednio:

```bash
dotnet run --project Etl/IleCzekam.Etl -- fetch --benefits kardiologia --provinces 12
dotnet run --project Etl/IleCzekam.Etl -- transform
```

`--benefits all` bierze wszystkie świadczenia z `config/benefits.yml`, `--provinces all`
wszystkie 16 województw. **Uwaga:** `--provinces` przyjmuje kody oddziałów NFZ `01`–`16`,
a nie kody TERYT — śląskie to `12`, nie `24` (API odrzuca `24` błędem 400).

## Trzy warstwy danych

```
data/
  raw/        # odpowiedzi API 1:1 — nigdy nie modyfikowane, nigdy nie kasowane
    recon/                 # próbki z fazy A (rozpoznanie API)
    snapshots/{YYYY-MM}/   # snapshoty miesięczne — źródło trendu
  processed/  # dane po transformacji: pełne flagi walidacji
  serving/    # finalne JSON-y pod frontend
config/
  settings.yml   # API, throttling, progi walidacji, progi pigułki, kody województw
  benefits.yml   # badane świadczenia + synonimy pacjenta
```

- **raw** — jeden plik = jedna odpowiedź API, z metadanymi (`endpoint`, `query`, `fetched_at`,
  `http_status`) i treścią osadzoną bajt w bajt w polu `response`. Partycjonowanie po miesiącu
  pobrania: ponowny fetch w tym samym miesiącu nadpisuje pliki tego miesiąca (idempotentność
  per miesiąc), snapshoty z poprzednich miesięcy zostają nietknięte. Fetch respektuje limity
  API: throttling między zapytaniami i retry z wykładniczym backoffem na 429/5xx.
- **processed** — dane po transformacji i walidacji, z kompletem flag.
- **serving** — pliki pod prerender stron świadczeń, `serving/swiadczenia/{slug}/{miasto}.json`.

`transform` nie wykonuje żadnych zapytań sieciowych i jest deterministyczny — czyta wyłącznie
`raw` i `config`, a `processed` oraz `serving` nadpisuje w całości.

## Czym jest PCUŚ i dlaczego to nie liczba

Od 10 lipca 2026 NFZ zrezygnował z „pierwszego wolnego terminu” (data) na rzecz
prognozowanego czasu udzielenia świadczenia. API zwraca go jako **polski tekst** —
`"0 dni"`, `"1 dzień"`, `"3 mies. 2 tyg."`, `"-"` (nie dotyczy) albo `null` (brak danych).
Konwersja na dni jest po naszej stronie i jest przybliżeniem. Szczegóły, rozkłady wartości
i pułapki: [RECON.md](../RECON.md).
