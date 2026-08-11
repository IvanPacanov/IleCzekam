# ETL czasów oczekiwania NFZ (Terminy Leczenia → ileczekam.pl)

Pipeline pobiera kolejki oczekujących z API NFZ „Terminy Leczenia”
(https://apinfz.nfz.gov.pl/app-itl-api-pcus/), mapuje prognozowany czas udzielenia
świadczenia (PCUŚ) na czytelną dla pacjenta „pigułkę” i generuje pliki JSON pod frontend.

Ustalenia o API, na których pipeline jest oparty (w tym rozbieżności między dokumentacją
a rzeczywistością), są w [RECON.md](../RECON.md).

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
make db                                         # processed/facts.jsonl -> baza analityczna SQLite
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
- **processed** — `processed/{świadczenie}/{województwo}/{YYYY-MM}.json`: wszystkie placówki
  danego miesiąca z kompletem flag, także te wykluczone z agregatów.
- **serving** — pliki pod prerender stron:
  `serving/swiadczenia/{świadczenie}/{miasto}.json`, `…/wojewodztwo-{kod}.json`
  oraz `serving/search-index/index.json` pod wyszukiwarkę.

## Walidacje

Każda reguła ma test (`make etl-test`), pozytywny i negatywny:

| Flaga | Znaczenie |
| --- | --- |
| `no_data` | placówka nie przekazała prognozy — bucket `brak_danych`, **nigdy 0 dni**; placówka zostaje na liście z telefonem i nie wchodzi do mediany |
| `not_applicable` | PCUŚ nie dotyczy świadczenia (opieka domowa, hospicja) — osobny bucket `nie_dotyczy` |
| `suspicious_value` | wartość ujemna lub powyżej `max_plausible_days` — placówka widoczna, wartość poza medianą |
| `stale_data` | statystyki placówki starsze niż `stale_data_months` |
| `low_sample` | agregat policzony z mniej niż `low_sample_threshold` placówek z danymi |

Duplikaty (ta sama komórka wykazana wielokrotnie) są scalane po kluczu
`(świadczenie, kod świadczeniodawcy, miejsce, adres)` — wygrywa rekord z nowszą datą
aktualności prognozy. Identyfikator `id` z API do tego NIE służy: jest unikalny w każdym
rekordzie, więc deduplikacja po nim nigdy nic nie usuwa (RECON.md, R6).

Fetch dodatkowo weryfikuje nazwy świadczeń z `benefits.yml` w słowniku NFZ — zapytanie
o kolejki z literówką zwraca HTTP 200 i zero wyników, co wyglądałoby jak „brak kolejek”.

## Analityka: tabela faktów i baza SQLite

`transform` zapisuje dodatkowo **tabelę faktów** `processed/facts.jsonl` — jeden wiersz
(JSON Lines) na `(miesiąc, świadczenie, województwo, placówka, przypadek)`, po deduplikacji.
To najniższe sensowne ziarno: wszystkie zestawienia i procenty da się z niego policzyć,
a format czyta każde narzędzie — SQLite, DuckDB, pandas, arkusz.

`make db` ładuje fakty do `data/analytics.sqlite`. Baza jest **pochodną**, nie źródłem prawdy:
kasowana i odtwarzana przy każdym uruchomieniu, w całości wyprowadzalna z `raw`.
**Frontend jej nie używa** — strony powstają z plików `serving/`.

| Obiekt | Zawartość |
| --- | --- |
| `facts` | ziarno surowe, jeden wiersz na placówkę × przypadek × miesiąc |
| `city_month_stats` | per miasto: mediana, p25, p75, min, max, liczności i **udziały procentowe** kubełków |
| `province_month_stats` | to samo na poziomie województwa |
| `v_city_vs_province` | miasto na tle województwa: różnica w dniach, krotność, `low_sample` |
| `v_city_month_change` | zmiana mediany miesiąc do miesiąca (`LAG`) — działa od 2. snapshotu |
| `v_bucket_shares` | rozkład kubełków w formacie długim, pod wykresy |
| `v_city_ranking` | ranking miast wewnątrz województwa |

Mediany i percentyle są policzone **raz, przy ładowaniu**, i leżą w kolumnach — bo SQLite
nie ma wbudowanej mediany, a bez tego każde zapytanie z konsoli musiałoby powtarzać
konstrukcję `ROW_NUMBER() OVER (PARTITION BY …)`. Zaokrąglenie jest celowo takie samo jak
w warstwie serving (połówki od zera), a osobny test pilnuje, żeby obie warstwy podawały
**tę samą liczbę** — inaczej serwis i analizy mówiłyby co innego o tej samej metryce.

Gotowe zapytania w [queries/](../queries/):

```bash
sqlite3 -box data/analytics.sqlite < queries/ranking-miast.sql
sqlite3 -box data/analytics.sqlite < queries/miasto-vs-wojewodztwo.sql
sqlite3 -box data/analytics.sqlite < queries/rozklad-kubelkow.sql
sqlite3 -box data/analytics.sqlite < queries/stabilny-vs-pilny.sql
sqlite3 -box data/analytics.sqlite < queries/zmiana-miesiac-do-miesiaca.sql   # od 2. snapshotu
```

### Zastrzeżenie do precyzji

`raw_days` jest **wyliczone z tekstu** PCUŚ przy założeniu 1 miesiąc = 30 dni, a PCUŚ powyżej
30 dni ma ziarnistość tygodnia — niepewność rzędu ±3 dni. Przy porównaniach miast różniących
się o kilka dni to szum, nie sygnał. Do analiz wymagających twardych liczb są kolumny
`average_period_days` i `awaiting` (liczby całkowite raportowane wprost przez placówki),
ale to średnia z przeszłości, nie prognoza — nie należy ich mieszać z PCUŚ w jednym wskaźniku.

`transform` nie wykonuje żadnych zapytań sieciowych i jest deterministyczny — czyta wyłącznie
`raw` i `config`, a `processed` oraz `serving` nadpisuje w całości.

## Czym jest PCUŚ i dlaczego to nie liczba

Od 10 lipca 2026 NFZ zrezygnował z „pierwszego wolnego terminu” (data) na rzecz
prognozowanego czasu udzielenia świadczenia. API zwraca go jako **polski tekst** —
`"0 dni"`, `"1 dzień"`, `"3 mies. 2 tyg."`, `"-"` (nie dotyczy) albo `null` (brak danych).
Konwersja na dni jest po naszej stronie i jest przybliżeniem. Szczegóły, rozkłady wartości
i pułapki: [RECON.md](../RECON.md).
