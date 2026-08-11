# RECON — rozpoznanie API NFZ „Terminy Leczenia” (faza A)

Data rozpoznania: **2026-08-10**. Wszystkie liczby pochodzą z zapytań wykonanych tego dnia,
z throttlingiem ≥ 600 ms między zapytaniami. Surowe odpowiedzi: [data/raw/recon/](data/raw/recon/),
log zapytań ze statusami HTTP: [data/raw/recon/_recon-log.txt](data/raw/recon/_recon-log.txt).

---

## 0. Wniosek w jednym akapicie

Prompt zakładał API `api.nfz.gov.pl/app-itl-api` i świadczenie „PORADNIA KARDIOLOGICZNA”.
**Oba założenia są nieaktualne.** Od 10 lipca 2026 obowiązuje nowe API v1.4 pod innym hostem
(`apinfz.nfz.gov.pl/app-itl-api-pcus`), w którym NFZ **wycofał pierwszy wolny termin (PWT)**
i zastąpił go prognozowanym czasem udzielenia świadczenia (PCUŚ). PCUŚ **nie jest datą ani
liczbą dni — to polski tekst** w rodzaju `"3 mies. 2 tyg."`, który musimy parsować sami.
Dodatkowo w danych NFZ **nie istnieje ambulatoryjne świadczenie kardiologiczne** — nie ma
„PORADNI KARDIOLOGICZNEJ” w żadnym województwie. Punkty 1–5 rozwijają te ustalenia,
sekcja 6 zbiera rozbieżności, sekcja 7 zawiera rekomendację modelu danych dla fazy B.

---

## 1. Endpointy, słowniki, paginacja

### Dwa hosty — stary i nowy

| | v1.3 (stare) | v1.4 (aktualne) |
| --- | --- | --- |
| Base URL | `https://api.nfz.gov.pl/app-itl-api/` | `https://apinfz.nfz.gov.pl/app-itl-api-pcus/` |
| Status | **przestarzałe** | obowiązujące od 10 lipca 2026 |
| Wskaźnik czasu | `dates.date` (PWT, data) | `dates.pcus` (PCUŚ, tekst) |
| Swagger | — | [`/swagger/v1.4/swagger.json`](https://apinfz.nfz.gov.pl/app-itl-api-pcus/swagger/v1.4/swagger.json) |

Cytat ze strony startowej starego API (zapis: `data/raw/recon/_docs-index.html`):

> Wersja API 1.3 jest nieaktualna. Od 10 lipca obowiązuje nowa wersja API 1.4,
> która jest dostępna pod adresem https://apinfz.nfz.gov.pl/app-itl-api-pcus/

Stary host **nadal odpowiada 200** i nadal zwraca `dates.date` — nie ma twardego wyłączenia,
więc łatwo nieświadomie zbudować ETL na wycofanym wskaźniku.

### Endpointy v1.4

Ze swaggera (`data/raw/recon/_swagger-v14.json`):

| Endpoint | Rola | Parametry |
| --- | --- | --- |
| `GET /queues` | kolejki — **główne źródło** | `province`, `benefit`, `provider`, `place`, `street`, `locality`, `case`, `anesthesia`, `benefitForAdultsChildren`, `benefitForChildren_0_3`, `_4_9`, `_10_15`, `_16_18`, `page`, `limit`, `format`, `api-version` |
| `GET /queues/{id}` | pojedyncza kolejka po UUID | `format`, `api-version` |
| `GET /many-places/{id}` | pozostałe miejsca tego samego świadczeniodawcy | `format`, `api-version` |
| `GET /benefits` | słownik nazw świadczeń | `name` (**wymagany**, min. 3 znaki), `page`, `limit` |
| `GET /localities` | słownik miejscowości | `name` (**wymagany**), `province`, `page`, `limit` |
| `GET /providers` | słownik świadczeniodawców | `name` (**wymagany**), `province`, `page`, `limit` |
| `GET /places` | słownik miejsc udzielania świadczeń | `name` (**wymagany**), `province`, `page`, `limit` |
| `GET /streets` | słownik ulic | `name` (**wymagany**), `province`, `page`, `limit` |
| `GET /version`, `/version/sources` | wersja API | `api-version` |

**Nie ma endpointu `/provinces` ani `/dictionaries`** (oba → 404, zapisane jako
`07-provinces.json`, `08-dictionaries.json`). Kody województw są wyłącznie w opisie parametru
`province` w swaggerze.

### Parametry — wartości ustalone empirycznie

- **`province`** — kody **oddziałów wojewódzkich NFZ `01`–`16`**, **NIE TERYT**:
  `01` dolnośląskie, `02` kujawsko-pomorskie, `03` lubelskie, `04` lubuskie, `05` łódzkie,
  `06` małopolskie, `07` mazowieckie, `08` opolskie, `09` podkarpackie, `10` podlaskie,
  `11` pomorskie, **`12` śląskie**, `13` świętokrzyskie, `14` warmińsko-mazurskie,
  `15` wielkopolskie, `16` zachodniopomorskie.
  `province=24` (TERYT śląskiego) → **HTTP 400** `Invalid value for {province} attribute`
  (`33-provinces-24.json`). Wartość `12` z promptu jest więc poprawna, ale przez zbieg
  okoliczności — to kod oddziału, nie TERYT.
- **`case`** — `1` = przypadek stabilny (domyślny), `2` = przypadek pilny. `case=5` → HTTP 400.
- **`limit`** — **maksymalnie 25**. `limit=26` i `limit=100` → HTTP 400
  `Invalid value for {limit} attribute` (`22-limit-26.json`, `24-queues-limit-100.json`).
  To twardy sufit paginacji i główny czynnik kosztu pełnego snapshotu.
- **`benefit`** — dopasowanie po **pełnej nazwie** ze słownika (maks. 250 znaków).
  Nazwa nieistniejąca **nie daje błędu**, tylko `count: 0` — literówka jest cicha.
- **Słowniki wymagają `name`** (min. 3 znaki). Bez niego HTTP 400
  `Missing required {name} attribute` — **nie da się wylistować całego słownika świadczeń**;
  można go tylko przeszukiwać po fragmencie nazwy.

### Format odpowiedzi i paginacja

```json
{
  "meta":  { "count": 8478, "page": 1, "limit": 25, "provider": "Narodowy Fundusz Zdrowia", ... },
  "links": { "first": "...", "prev": null, "self": "...", "next": "...", "last": "..." },
  "data":  [ { "type": "queue", "id": "<uuid>", "attributes": { ... } } ]
}
```

Paginacja: `links.next` = `null` na ostatniej stronie (pewny warunek stopu; `meta.count`
też jest wiarygodny — 340 stron × 25 = 8 500 ≥ 8 478). Format `json` lub `xml`.

---

## 2. KLUCZOWE — stan wskaźnika czasu oczekiwania

### Co się zmieniło (changelog NFZ, `_changelog.html`)

> **API v.1.4, 10 lipca 2026**
> – dodanie informacji o prognozowanym czasie oczekiwania
> – **rezygnacja z prezentowania informacji o pierwszym wolnym terminie**
> – zmiana sposobu filtrowania miejsc świadczeń udzielanym dzieciom `benefitForAdultsChildren`
> – podział filtru świadczeń dla dzieci na grupy wiekowe `benefitForChildren_0_3` …
> – ujednolicenie formatu zwracanych danych. Property `anesthesia` zwracająca dotychczas `T`/`N` teraz zwraca `Y`/`N`
> – rozszerzenie zakresu informacji o udogodnieniach
>
> **API v.1.4, 29 lipca 2026** – dodanie property `queue-in-cer`

### Jak wygląda `dates` w praktyce

**v1.3 (stare API)** — `10-queues-stabilny-p1.json`, `17-queues-brak-benefit.json`:

```json
"dates": { "applicable": true, "date": "2026-08-03", "date-situation-as-at": "2026-08-03" }
```

**v1.4 (aktualne API)** — `44-pcus-queues-nobenefit.json`:

```json
"dates": { "applicable": true, "pcus": "0 dni", "date-situation-as-at": "2026-07-04" }
```

Pole `date` **nie występuje w żadnym z 8 478 rekordów** pełnego snapshotu v1.4 — PWT zniknął
całkowicie, nie ma okresu przejściowego z dwoma wskaźnikami. Schemat swaggera nazywa się
`estimated-time-to-receive-benefit` i ma dokładnie trzy pola:

| Pole | Typ | Opis wg NFZ |
| --- | --- | --- |
| `applicable` | bool | „Wyróżnik określający czy dla świadczenia występuje PCUS” |
| `pcus` | string, nullable | **„Prognozowany czas udzielenia świadczenia.”** |
| `date-situation-as-at` | date, nullable | „Data aktualizacji prognozowanego PCUS” |

### ⚠ `pcus` to tekst po polsku, nie liczba i nie data

Rozkład **wszystkich** wartości `pcus` w snapshocie woj. śląskiego (8 478 rekordów, case=1):

| Wzorzec | Liczba | Udział | Przykłady |
| --- | ---: | ---: | --- |
| `N dni` | 3 577 | 42,2 % | `0 dni`, `4 dni`, `27 dni` |
| `N mies. N tyg.` | 1 869 | 22,0 % | `1 mies. 2 tyg.`, `3 mies. 3 tyg.` |
| `N mies.` | 1 006 | 11,9 % | `2 mies.`, `160 mies.` |
| `N mies. N tydz.` | 964 | 11,4 % | `1 mies. 1 tydz.` |
| `null` (całe `dates` = `null`) | 675 | 8,0 % | — |
| `-` (`applicable: false`) | 300 | 3,5 % | — |
| `N dzień` | 87 | 1,0 % | `1 dzień` |

172 unikalne wartości, 7 wzorców. **Trzy stany „braku”, każdy o innym znaczeniu:**

| Stan | Liczba | `applicable` | Znaczenie |
| --- | ---: | --- | --- |
| wartość | 7 503 | `true` | jest prognoza |
| `pcus: "-"` | 300 | `false` | **PCUŚ z definicji nie dotyczy** tego świadczenia — to opieka domowa/hospicyjna (`PIELĘGNIARSKA OPIEKA DŁUGOTERMINOWA DOMOWA`, `HOSPICJUM DOMOWE`), gdzie „kolejka” nie ma sensu |
| `dates: null` | 675 | — | placówka nie przekazała prognozy (np. część `PORADNIA POŁOŻNICZO-GINEKOLOGICZNA`) |

Odmiana rzeczownika jest polska i niekonsekwentna: `1 dzień` / `4 dni`, `1 tydz.` / `2 tyg.`
Parser musi obsłużyć oba warianty — mój parser referencyjny (`N dni|dzień`, `N mies. [N tyg.|tydz.]`,
1 mies. = 30 dni) **sparsował 7 503/7 503 wartości bez ani jednej porażki**.

### Czy zostało cokolwiek liczbowego?

Tak — i to jest ważne dla walidacji. `statistics.provider-data.average-period` to
**liczba całkowita dni** („Średnia liczba dni oczekiwania na świadczenie zdrowotne”),
raportowana przez placówkę co miesiąc. Na 5 502 rekordach mających obie wartości:

- mediana różnicy `pcus − average_period` = **1 dzień**, średnia **−2,1 dnia**.

Czyli PCUŚ i raportowana średnia są ze sobą spójne co do rzędu wielkości — `average-period`
nadaje się na **niezależny kontroler sanity check** dla sparsowanego PCUŚ, ale nie na wskaźnik
główny (to średnia z przeszłości, nie prognoza).

`statistics.computed-data` (wyliczane przez NFZ) jest `null` w **100 % rekordów** (8 478/8 478) —
w praktyce pole martwe.

---

## 3. Pozostałe pola kolejki

Pełny przykładowy rekord: sekcja 5 poniżej. Tabela pól istotnych dla serwisu:

| Pole | Typ | Braki (śląskie, n=8 478) | Uwagi |
| --- | --- | ---: | --- |
| `id` | uuid | 0 | **klucz deduplikacji** — 8 478 unikalnych na 8 478 rekordów |
| `benefit` | string | 0 | nazwa świadczenia (394 unikalne w województwie) |
| `case` | int | 0 | 1 stabilny / 2 pilny |
| `provider` | string | 0 | świadczeniodawca |
| `provider-code`, `regon-provider`, `nip-provider` | string | 0 | identyfikatory podmiotu |
| `place` | string | 0 | nazwa komórki, bywa z białymi znakami na końcu (`"ODDZIAŁ KARDIOLOGII "`) |
| `address` | string | 0 | ulica + numer, BEZ miasta i kodu pocztowego |
| `locality` | string | 0 | miejscowość (228 unikalnych) |
| `teryt-place` | string | 0 | TERYT miejsca (173 unikalne) — **lepszy klucz agregacji niż nazwa** |
| `phone` | string | **2** (0,02 %) | praktycznie zawsze jest — spełnia wymóg „placówka bez danych zostaje z telefonem” |
| `latitude`, `longitude` | double | **7 944 (93,7 %)** | ⚠ geolokalizacja praktycznie niedostępna — patrz R4 |
| `benefits-for-children` | `Y`/`N` | 0 | |
| `age-range` | string | 7 862 (92,7 %) | przedział wiekowy dzieci w poradni dla dorosłych |
| `many-places` | `Y`/`N` | 0 | `Y` w 2 534 rekordach → `/many-places/{id}` |
| `queue-in-cer` | `Y`/`N` | 0 | `Y` w 395 rekordach (nowość z 29 lipca) |
| `toilet`, `ramp`, `car-park`, `elevator`, `ac`, `automatic-door`, `wheelchairs`, `corridors` | `Y`/`N`/null | — | udogodnienia dla niepełnosprawnych |
| `type-building` | int | — | 1 parterowy, 2 wielokondygnacyjny |
| `public-transport-lines` | string | — | numery linii komunikacji |
| `statistics.provider-data.awaiting` | int | 702 (8,3 %) | liczba oczekujących na koniec miesiąca |
| `statistics.provider-data.removed` | int | 702 | skreśleni w miesiącu |
| `statistics.provider-data.average-period` | int | 702 | średnia liczba dni |
| `statistics.provider-data.update` | `YYYY-MM` | 702 | miesiąc danych: `2026-07` (5 374), `2026-06` (2 402) |
| `statistics.computed-data` | obiekt | **8 478 (100 %)** | zawsze null |
| `benefits-provided` | obiekt | **8 478 (100 %)** | zawsze null (dotyczy endoprotezoplastyki) |
| `dates.date-situation-as-at` | date | 975 (11,5 %) | data aktualności prognozy |

**Rozróżnienie dorośli/dzieci** działa dwutorowo i inaczej niż w prompcie:
osobne świadczenia z sufiksem `DLA DZIECI` w słowniku **oraz** parametry zapytania
`benefitForAdultsChildren` (1 = wszyscy, 2 = dorośli, 3 = dzieci) i cztery filtry wiekowe
`benefitForChildren_0_3 / _4_9 / _10_15 / _16_18`. Parametr `benefitForChildren` z v1.3 **już nie istnieje**.

---

## 4. Wolumeny i limity

### Rate limit i regulamin

Z regulaminu API (`_statute.html`), sekcja III:

> API Terminy Leczenia posiada zaimplementowane mechanizmy limitowania ustawione na
> **10 zapytań na sekundę per jeden adres IP**.

> Usługobiorca wykorzystujący Oprogramowanie API Terminy Leczenia obowiązany jest jednocześnie
> do **informowania o źródle pochodzenia danych poprzez wskazanie adresu https://api.nfz.gov.pl/**.

> Niedozwolone są̨ działania mogące doprowadzić́ do „przeciążenia” API.

**Rejestracja ani klucz API nie są wymagane.** W odpowiedziach **nie ma nagłówków rate-limit**
(brak `X-RateLimit-*`, `Retry-After`) — jedyny sygnał to HTTP 429, którego nie wywołaliśmy.
Test serii 5 zapytań co 100 ms nie dał 429 (odpowiedzi 400 wynikały z brakującego `name`,
nie z limitu — patrz `_recon-log.txt`). Throttling 600 ms w `config/settings.yml` daje
~1,7 zapytania/s, czyli **6× zapasu** pod limitem.

Przed API stoi CDN Imperva (`x-cdn: Imperva`), co jest dodatkowym argumentem za łagodnym ruchem.

### Ile jest danych

Słownika świadczeń **nie da się wylistować w całości** (wymagany `name`). Z pełnego snapshotu
woj. śląskiego: **394 unikalne nazwy świadczeń** w jednym województwie.

Liczba kolejek per województwo (`_volumes.txt`, zapytania `limit=1`, odczyt `meta.count`):

| Kod | Województwo | case=1 | Kod | Województwo | case=1 |
| --- | --- | ---: | --- | --- | ---: |
| 01 | dolnośląskie | 5 509 | 09 | podkarpackie | 4 974 |
| 02 | kujawsko-pomorskie | 4 037 | 10 | podlaskie | 2 507 |
| 03 | lubelskie | 4 921 | 11 | pomorskie | 3 662 |
| 04 | lubuskie | 1 828 | **12** | **śląskie** | **8 478** |
| 05 | łódzkie | 5 325 | 13 | świętokrzyskie | 2 574 |
| 06 | małopolskie | 5 774 | 14 | warmińsko-mazurskie | 2 637 |
| 07 | mazowieckie | 10 400 | 15 | wielkopolskie | 6 236 |
| 08 | opolskie | 1 740 | 16 | zachodniopomorskie | 2 911 |

**Razem 73 513 kolejek** dla `case=1`. Dla `case=2` `meta.count` jest **identyczny w każdym
z 16 województw**, ale zwracane rekordy są inne (inne UUID, inne świadczenia) — obie listy mają
po prostu tę samą liczność. Łącznie ≈ **147 026 rekordów** na pełny snapshot Polski.

### Koszt pełnego ogólnopolskiego snapshotu

Przy `limit=25` i throttlingu 600 ms:

| Strategia | Zapytań | Czas |
| --- | ---: | ---: |
| **per województwo × case** (bez filtra `benefit`, podział na świadczenia lokalnie) | 16 × 2 × ~184 stron ≈ **5 900** | **≈ 1 godz.** |
| per świadczenie × województwo × case | 394 × 16 × 2 ≈ 12 608 zapytań *tylko na pierwsze strony* | wielokrotnie dłużej |
| jedno województwo (śląskie), case=1 | 340 | ~4 min |

**Rekomendacja: pobierać całe województwa bez filtra `benefit`** i dzielić na świadczenia
w `transform`. Jest to ~2× tańsze, odporne na literówki w nazwach świadczeń i daje przy okazji
pełny słownik świadczeń, którego endpoint `/benefits` nie potrafi wylistować.

---

## 5. Jakość danych na próbce

Próbka: **pełny** snapshot woj. śląskiego (`province=12`, `case=1`), 340 stron, **8 478 rekordów**,
394 świadczenia, 228 miejscowości. Surowe strony: `data/raw/recon/slaskie-case1-pcus/`.

### Kompletność wskaźnika czasu

| Stan | Liczba | Udział |
| --- | ---: | ---: |
| PCUŚ podany | 7 503 | 88,5 % |
| `dates: null` (brak prognozy) | 675 | 8,0 % |
| `pcus: "-"` (PCUŚ nie dotyczy) | 300 | 3,5 % |
| `date-situation-as-at: null` | 975 | 11,5 % |
| `provider-data: null` (brak statystyk) | 702 | 8,3 % |

### Rozkład sparsowanych wartości (n = 7 503)

min **0 dni**, mediana **37 dni**, max **4 800 dni** (≈ 13 lat).

| Kubełek (progi z promptu) | Liczba | Udział |
| --- | ---: | ---: |
| krótko (< 30 dni) | 3 610 | 48,1 % |
| umiarkowanie (30–90) | 1 857 | 24,8 % |
| długo (91–180) | 1 012 | 13,5 % |
| bardzo długo (> 180) | 1 024 | 13,6 % |

Progi z promptu dzielą populację sensownie — **rekomenduję zostawić je bez zmian**.

### Anomalie

- **`0 dni` w 1 604 rekordach (21,4 % podanych wartości)** — to nie jest błąd, tylko
  „przyjmują od ręki”. **Nie wolno mylić z brakiem danych** — i odwrotnie, brak danych
  nigdy nie może zostać zmapowany na 0. To dokładnie ryzyko z walidacji nr 1 w prompcie.
- **Wartości > 5 lat: 7 rekordów.** Wszystkie to `REHABILITACJA OGÓLNOUSTROJOWA` /
  `NEUROLOGICZNA W WARUNKACH STACJONARNYCH` w uzdrowiskach (Goczałkowice-Zdrój, Ustroń,
  Jaworze) — max `160 mies.` = 4 800 dni. Wygląda na dane realne, nie na błąd zapisu,
  ale i tak trzeba je trzymać poza medianami (flaga `suspicious_value`).
- **Wartości ujemne: 0.** `average-period` również nigdy nie jest ujemny.
- **Daty z przeszłości**: pojęcie nie ma zastosowania — PCUŚ jest czasem trwania, nie datą.
  Zastępczo sprawdziłem wiek `date-situation-as-at`: mediana **8 dni**, maksimum **70 dni**,
  **żaden rekord nie jest starszy niż 90 dni**. Czyli reguła walidacji „starsze niż 3 miesiące
  → `stale_data`” **nie oflaguje dziś ani jednego rekordu** — flagę warto zostawić jako
  zabezpieczenie, ale nie jest to realny problem tych danych.
- **Duplikaty:** po `id` — **zero**. Po `(benefit, provider-code, place, address)` — **7 par**
  (ta sama komórka wykazana dwa razy, zwykle z różnymi datami aktualizacji). Deduplikacja po
  `id` jest więc niewystarczająca dla agregatów; potrzebny klucz biznesowy.
- **`place` bywa z końcową spacją** (`"ODDZIAŁ KARDIOLOGII "`) — wymaga trymowania.

### Przykładowy rekord (Gliwice, oddział kardiologiczny)

```json
{
  "benefit": "ODDZIAŁ KARDIOLOGICZNY",
  "provider": "SZPITAL MIEJSKI W GLIWICACH SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ",
  "place": "ODDZIAŁ KARDIOLOGII ",
  "address": "TADEUSZA KOŚCIUSZKI 29",
  "locality": "GLIWICE",
  "phone": "+48 32 461 32 01",
  "teryt-place": "2466011",
  "latitude": null, "longitude": null,
  "statistics": { "provider-data": { "awaiting": 50, "removed": 7, "average-period": 105, "update": "2026-07" },
                  "computed-data": null },
  "dates": { "applicable": true, "pcus": "3 mies. 2 tyg.", "date-situation-as-at": "2026-08-07" }
}
```

---

## 6. Rozbieżności i pułapki

Wypisane jawnie, w kolejności wagi.

### R1. „PORADNIA KARDIOLOGICZNA” nie istnieje — przypadek testowy z promptu jest niewykonalny

Zapytanie `queues?benefit=PORADNIA KARDIOLOGICZNA` zwraca `count: 0` — zarówno dla
woj. śląskiego, jak i **dla całej Polski**, w starym i nowym API. Weryfikacja niezależna:
w pełnym snapshocie 8 478 rekordów śląskiego takie świadczenie nie występuje ani razu.

Ambulatoryjne specjalizacje są w słowniku pod nazwą `ŚWIADCZENIA Z ZAKRESU X` — jest ich
dokładnie 11 (diabetologia, endokrynologia, gastroenterologia, gruźlica i choroby płuc,
nefrologia, neurologia, okulistyka, onkologia, ortopedia, otolaryngologia, urologia)
i **kardiologii wśród nich nie ma**. Nie ma też `ŚWIADCZENIA Z ZAKRESU KARDIOLOGII`
(`count: 0`) ani `PORADNIA KARDIOLOGICZNA` w żadnej odmianie.

Wszystkie kardiologiczne świadczenia dostępne w woj. śląskim (case=1):

| Liczba placówek | Świadczenie |
| ---: | --- |
| **29** | ODDZIAŁ KARDIOLOGICZNY |
| 9 | REHABILITACJA KARDIOLOGICZNA W WARUNKACH STACJONARNYCH |
| 9 | ZAKŁAD/OŚRODEK REHABILITACJI KARDIOLOGICZNEJ |
| 5 | ZAKŁAD/OŚRODEK REHABILITACJI KARDIOLOGICZNEJ DZIENNEJ |
| 5 | KARDIOLOGICZNA TELEREHABILITACJA HYBRYDOWA W WARUNKACH STACJONARNYCH |
| 4 | LECZENIE PACJENTÓW Z KARDIOMIOPATIĄ |
| 3 | PORADNIA KARDIOCHIRURGICZNA |
| 3 | ODDZIAŁ KARDIOCHIRURGICZNY |
| 2 | ODDZIAŁ KARDIOCHIRURGICZNY DLA DZIECI |
| 2 | ODDZIAŁ KARDIOLOGICZNY DLA DZIECI |
| 2 | KARDIOLOGICZNE ZABIEGI INTERWENCYJNE U DZIECI DO LAT 18 … |
| 1 | PORADNIA KARDIOCHIRURGICZNA DLA DZIECI |

**Do decyzji właściciela (potrzebna przed fazą B).** Kandydaci na przypadek testowy:

1. **`ODDZIAŁ KARDIOLOGICZNY`** — 29 placówek w 18 miejscowościach, w tym Gliwice (1 placówka).
   Trzyma się intencji promptu („kardiologia w śląskim”), pokrywa wszystkie stany walidacji
   (jest rekord z `dates: null` w Zabrzu, są miasta z 1 placówką → `low_sample`).
   **Minus:** Gliwice mają dokładnie jedną placówkę, więc wymagany w prompcie „pełny plik
   serving dla Gliwic” pokaże agregat z próby n=1.
2. **`ŚWIADCZENIA Z ZAKRESU OKULISTYKI`** — 266 placówek w województwie, 13 w Gliwicach.
   Odchodzi od kardiologii, ale daje realistyczny widok miasta z sensowną medianą
   i porządnym testem agregatów.

Konfiguracja w [config/benefits.yml](config/benefits.yml) zakłada na razie wariant 1
(slug `kardiologia` grupuje wszystkie 9 świadczeń kardiologicznych) — do zmiany jednym wpisem.

### R2. Prompt wskazuje wycofane API i wycofany wskaźnik

Prompt mówi o „okresie przejściowym z oboma wskaźnikami”. Okresu przejściowego **nie ma**:
nowe API nie zwraca PWT w ogóle, stare API nie zwraca PCUŚ w ogóle. Trzeba wybrać jedno —
wybieram v1.4/PCUŚ, bo v1.3 jest oznaczone jako nieaktualne przez samego dostawcę.

### R3. `pcus` nie jest liczbą dni ani datą — model danych musi to uwzględnić

Prompt zakładał `raw_days` wprost z API. W rzeczywistości `raw_days` jest **naszym wyliczeniem
z tekstu**, obarczonym założeniem „1 miesiąc = 30 dni”. Konsekwencje:

- ziarnistość PCUŚ powyżej 30 dni to tydzień, nie dzień — `2 mies. 1 tydz.` = 67 dni ±3;
- `human_label` z promptu („ok. 3 miesiące”) **można w większości przypadków wziąć wprost
  z `pcus`** zamiast rekonstruować z dni — NFZ już podał zaokrągloną formę po polsku;
- w warstwie processed trzeba trzymać **oryginalny tekst** obok wyliczonych dni, żeby dało się
  później zmienić regułę konwersji bez ponownego fetchu.

### R4. Brak geolokalizacji w 93,7 % rekordów

Pola `latitude`/`longitude` istnieją w schemacie, ale są wypełnione tylko w 534 z 8 478 rekordów.
Mapy/„najbliżej mnie” wymagają **własnego geokodowania** z `address` + `locality`
(adres nie zawiera miasta ani kodu pocztowego — trzeba je skleić). To osobny temat, poza fazą B.

### R5. Reguła `stale_data` (3 miesiące) jest dziś martwa

Żaden rekord nie ma `date-situation-as-at` starszego niż 70 dni. Flaga zostaje, ale nie oczekujmy,
że cokolwiek oflaguje. Realny odpowiednik „nieświeżości” to `provider-data.update` = `2026-06`
(2 402 rekordy, 28,3 %) przy bieżącym `2026-07` — i to jest lepszy kandydat na tę walidację.

### R6. Deduplikacja po identyfikatorze API nie wystarczy

`id` jest unikalne zawsze (8 478/8 478), więc reguła „deduplikacja po identyfikatorze z API”
z promptu **nigdy nic nie usunie**. Realne duplikaty (7 par) są widoczne dopiero po kluczu
`(benefit, provider-code, place, address)`.

### R7. Cicha porażka przy złej nazwie świadczenia

`benefit` z literówką → HTTP 200 i `count: 0`, bez ostrzeżenia. Fetch **musi** traktować
zerowy wynik dla skonfigurowanego świadczenia jako błąd konfiguracji, a nie jako „brak kolejek”.

### R8. Drobiazgi

- `case=1` i `case=2` mają identyczne `meta.count` we wszystkich 16 województwach (ale różne dane) — warto zweryfikować przy pierwszym pełnym fetchu, czy to nie artefakt.
- `anesthesia` zmieniło format z `T`/`N` na `Y`/`N` w v1.4.
- Brak endpointu do listowania słownika świadczeń — pełny słownik powstaje u nas, ze snapshotu.
- Odpowiedzi nie mają nagłówków cache’ujących ani rate-limitowych; jedyny nagłówek wersji to `api-supported-versions`.

---

## 7. Rekomendacja modelu danych dla fazy B

### Warstwa raw

Pobieramy **całe województwa**, nie pojedyncze świadczenia (uzasadnienie w sekcji 4):

```
data/raw/snapshots/{YYYY-MM}/queues/{province}/case-{case}/page-{NNN}.json
```

Jeden plik = jedna odpowiedź API 1:1 + metadane (`endpoint`, `query`, `fetched_at`,
`http_status`). Ponowny fetch w tym samym miesiącu nadpisuje pliki tego miesiąca;
snapshoty poprzednich miesięcy pozostają nietknięte. Nic z `raw/` nie jest kasowane.

### Struktura czasu oczekiwania w processed/serving

```json
"wait": {
  "pcus_raw": "3 mies. 2 tyg.",
  "raw_days": 105,
  "human_label": "ok. 3,5 miesiąca",
  "bucket": "dlugo",
  "applicable": true,
  "as_at": "2026-08-07",
  "flags": []
}
```

- `pcus_raw` — oryginalny tekst z API (odtwarzalność bez ponownego fetchu);
- `raw_days` — nasze wyliczenie (`1 mies. = 30 dni`), `null` gdy brak;
- `bucket` — `krotko` | `umiarkowanie` | `dlugo` | `bardzo_dlugo` | `brak_danych` | `nie_dotyczy`
  (**szósty kubełek** ponad prompt: dla 300 rekordów z `applicable: false` — hospicja i opieka
  domowa; wrzucenie ich do `brak_danych` sugerowałoby pacjentowi, że dane zaginęły, a one po
  prostu nie mają zastosowania);
- progi bez zmian względem promptu (potwierdzone rozkładem w sekcji 5).

### Reguły walidacji — korekty względem promptu

| # | Reguła z promptu | Werdykt po rozpoznaniu |
| --- | --- | --- |
| 1 | brak danych ≠ 0 dni | **utrzymać, priorytet 1** — 1 604 rekordy mają realne `0 dni`, pomyłka jest tu bardzo kosztowna |
| 2 | anomalie: ujemne / data w przeszłości / > 5 lat | ujemnych brak; „data w przeszłości” nie ma zastosowania (PCUŚ to czas trwania) → zastąpić kontrolą `pcus` vs `average-period`; „> 5 lat” utrzymać (7 rekordów) |
| 3 | `stale_data` > 3 mies. | utrzymać, ale przestawić na `provider-data.update` (patrz R5) |
| 4 | deduplikacja po id z API | **zmienić klucz** na `(benefit, provider-code, place, address)` (patrz R6) |
| 5 | `low_sample` < 3 placówek | utrzymać — przy kardiologii zadziała często (18 miejscowości, w większości 1–2 placówki) |
| 6 | raport walidacji na stdout | utrzymać |
| **+7** | — | **nowa:** świadczenie z configu, które w snapshocie ma 0 rekordów → błąd konfiguracji (patrz R7) |

### Agregacja

Agregować po **`teryt-place`**, nie po nazwie miejscowości: nazwy bywają niejednoznaczne,
TERYT jest stabilny i wprost daje mapowanie miasto → slug URL.

---

## 8. Co dalej

Zgodnie z zasadami pracy z promptu **zatrzymuję się tutaj i czekam na akceptację**.
Do rozstrzygnięcia przed fazą B:

1. **R1** — który benefit robimy jako vertical slice (rekomendacja: `ODDZIAŁ KARDIOLOGICZNY`,
   ze świadomością n=1 dla Gliwic; alternatywa: okulistyka)?
2. **R3** — czy `human_label` bierzemy wprost z `pcus` NFZ, czy generujemy własny z `raw_days`
   wg reguł zaokrągleń z promptu (dni / tygodnie / miesiące)?
3. Czy szósty kubełek `nie_dotyczy` wchodzi do modelu (rekomendacja: tak).

---

## Źródło danych

Dane pochodzą z API Narodowego Funduszu Zdrowia — **https://api.nfz.gov.pl/**.
Wskazanie tego adresu jest wymogiem regulaminowym i musi trafić na strony serwisu.
