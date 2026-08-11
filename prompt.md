# PROMPT DLA AGENTA KODUJĄCEGO — ROZPOZNANIE API NFZ + ETL ZE SNAPSHOTAMI (ileczekam.pl)

## Rola i cel

Jesteś agentem kodującym pracującym w nowym repozytorium projektu ileczekam.pl — serwisu pokazującego pacjentom czasy oczekiwania na leczenie NFZ. Budujesz warstwę danych w dwóch fazach:

**Faza A (rozpoznanie — wykonaj najpierw, wyniki przedstaw PRZED pisaniem właściwego ETL):** empiryczne zbadanie API NFZ "Terminy Leczenia" i udokumentowanie jego rzeczywistej struktury.

**Faza B (ETL vertical slice):** pipeline fetch→transform dla jednego przypadku testowego — świadczenia kardiologiczne (poradnia kardiologiczna) w województwie śląskim — z warstwą historycznych snapshotów.

Wzorzec architektury jest sprawdzony w poprzednim projekcie tego repozytorium właściciela (ETL budżetów gmin): trzy warstwy raw/processed/serving, rozdzielone komendy, idempotentność, walidacje z flagami. Stosuj go, z modyfikacjami opisanymi niżej.

## Faza A — rozpoznanie API (deliverable: RECON.md + zapisane próbki odpowiedzi)

Punkt wejścia: https://api.nfz.gov.pl/ (API "Terminy Leczenia", dokumentacja app-itl-api). Zbadaj i udokumentuj:

1. **Endpointy i słowniki:** jak pobrać listę świadczeń (benefits), województw, miejscowości; jak wygląda zapytanie o kolejki (queues) — parametry (case pilny/stabilny, benefit, province, locality, dzieci/dorośli), paginacja, format odpowiedzi.
2. **KLUCZOWE — stan wskaźnika czasu oczekiwania:** od lipca 2026 NFZ wprowadził "prognozowany czas oczekiwania" (PCUŚ) zastępujący raportowany przez placówki "pierwszy wolny termin" (PWT). Sprawdź empirycznie, co API faktycznie zwraca DZIŚ: które pole/pola niosą czas oczekiwania, czy PWT nadal występuje, czy PCUŚ jest osobnym polem, w jakiej jednostce (data? liczba dni?), czy występuje okres przejściowy z oboma wskaźnikami, czy dokumentacja zgadza się z rzeczywistością. Rozbieżności dokumentacja-vs-API wypisz jawnie. To rozstrzyga model danych całego projektu.
3. **Pozostałe pola kolejki:** liczba oczekujących, średni czas, data aktualizacji per placówka, dane placówki (nazwa, adres, telefon!, współrzędne — czy API daje geolokalizację, czy trzeba geokodować adresy osobno), rozróżnienie dorośli/dzieci.
4. **Wolumeny i limity:** ile jest świadczeń w słowniku, ile rekordów zwraca zapytanie o jedno świadczenie w jednym województwie, oszacuj liczbę zapytań potrzebną na PEŁNY ogólnopolski snapshot (wszystkie świadczenia × województwa × przypadki). Sprawdź nagłówki rate-limit i zachowanie przy szybkich seriach zapytań (ostrożnie — regulamin API zakazuje przeciążania; testuj z throttlingiem od początku, min. 500 ms między zapytaniami).
5. **Jakość danych na próbce:** pobierz kolejki kardiologiczne dla śląskiego i policz: ile placówek ma komplet danych, ile ma braki (null/brak pola vs 0 vs data w przeszłości), jakie anomalie widać (czasy ujemne? daty z przeszłości? duplikaty placówek?). Wyniki liczbowo w RECON.md.

Format RECON.md: opis endpointów z przykładami zapytań, tabela pól z typami i uwagami, sekcja "rozbieżności i pułapki", oszacowanie wolumenów, rekomendacja modelu danych dla fazy B. Surowe próbki odpowiedzi zapisz do `data/raw/recon/`.

## Faza B — ETL vertical slice (po akceptacji RECON.md przez właściciela — zatrzymaj się i poczekaj na nią)

### Architektura

```
data/
  raw/snapshots/{YYYY-MM}/...   # odpowiedzi API 1:1 + metadane pobrania; NIGDY nie kasowane
  processed/                     # po transformacji i walidacji
  serving/
    swiadczenia/{benefit-slug}/{wojewodztwo|miasto-slug}.json   # pod prerender stron
    search-index/                # indeks pod przyszłe API wyszukiwarki
config/
  benefits.yml    # lista badanych świadczeń (na razie: kardiologia) + słownik synonimów pacjenta
  settings.yml    # throttling, progi walidacji, progi pigułki czasu
```

**Różnica względem ETL budżetów — snapshoty historyczne:** dane NFZ pokazują tylko stan bieżący; historia powstaje u NAS przez comiesięczne zachowywanie snapshotów. Warstwa raw jest partycjonowana po miesiącu pobrania (`{YYYY-MM}`), a serving zawiera pole `trend` budowane ze WSZYSTKICH dostępnych snapshotów. Fetch uruchomiony dwa razy w tym samym miesiącu nadpisuje snapshot tego miesiąca (idempotentność per miesiąc).

### Komendy

1. `fetch --benefits kardiologia --provinces 12` — pobiera do raw/snapshots/{bieżący-miesiąc}/. Throttling z configu, retry z backoffem na 429/5xx, log postępu, klucz/identyfikator klienta jeśli API go wspiera.
2. `transform` — czyta wyłącznie raw + config, pisze processed + serving. Zero sieci, deterministyczny.

### Transform — logika

- **Czas oczekiwania → stan pigułki:** mapuj wartość z API na strukturę `{ raw_days, human_label ("ok. 3 miesiące"), bucket (krotko|umiarkowanie|dlugo|bardzo_dlugo|brak_danych) }` wg progów z configu (propozycja startowa: <30 dni krótko, 30–90 umiarkowanie, 91–180 długo, >180 bardzo długo — do potwierdzenia po RECON). Reguły zaokrągleń human_label: <30 dni → dni; 30–84 → tygodnie; ≥85 → miesiące; zawsze z "ok.".
- **Agregaty per miasto i województwo:** mediana czasu, najszybsza placówka, liczba placówek z danymi / bez danych — to zasila widok "Kardiolog w Gliwicach" i porównania.
- **Serving per (świadczenie, miasto):** nagłówek-odpowiedź (mediana, najszybszy), lista placówek (nazwa, adres, telefon, czas jako struktura pigułki, liczba oczekujących, data danych placówki, współrzędne jeśli są), porównanie (mediana miasta vs województwa vs najlepsze miasto w Polsce — na etapie slice: vs najlepsze miasto w województwie), trend z snapshotów.

### Walidacje (twarde reguły, każda z testem)

1. **Brak danych ≠ krótka kolejka:** brak wartości czasu → bucket `brak_danych`, nigdy 0 dni ani pominięcie placówki. Placówka bez danych ZOSTAJE na liście (z telefonem).
2. **Anomalie czasu:** wartość ujemna, data pierwszego terminu w przeszłości względem snapshotu, czas > 5 lat → flaga `suspicious_value`, wartość nie wchodzi do median.
3. **Data aktualizacji placówki starsza niż 3 miesiące** → flaga `stale_data`, widoczna w serving (frontend pokaże datę i tak, ale flaga pozwoli filtrować z agregatów).
4. **Duplikaty placówek** (ta sama placówka wielokrotnie w wynikach) → deduplikacja po identyfikatorze z API, log.
5. **Mediana licząca się z <3 placówek** → agregat z flagą `low_sample` (frontend doda zastrzeżenie).
6. Raport walidacji na stdout po transform: liczby placówek OK/z flagami per typ flagi.

### Wymagania niezależne od fazy

- Stack: dobierz spójny z repo właściciela (poprzedni ETL: .NET 9; jeśli repo jest puste — .NET 9 konsolówka + NUnit, wzorzec Makefile fetch/transform/test).
- Atrybucja: README musi zawierać wymóg regulaminowy informowania o źródle (api.nfz.gov.pl) — do przeniesienia potem na strony serwisu.
- Testy transform na fiksturach (małe ręczne JSON-y z RECON): mapowanie pigułki i zaokrągleń, każda walidacja pozytywnie i negatywnie, budowa trendu z 2+ snapshotów, deduplikacja. Żadnych testów bijących w prawdziwe API.
- Sekrety/identyfikatory z env; `.env.example` w repo.
- Niczego nie kasuj z raw; transform nadpisuje processed i serving w całości.

## Krok końcowy fazy B

Uruchom pełny slice: fetch kardiologii dla śląskiego → transform → pokaż: (a) raport walidacji z liczbami, (b) pełny plik serving dla Gliwic, (c) plik serving dla najmniejszego miasta z >0 placówek (test low_sample), (d) listę rozbieżności między tym promptem a rzeczywistością API — jawnie, nie obchodź po cichu.

## Zasady pracy

- Faza A przed fazą B — bez wyjątków; po RECON.md ZATRZYMAJ SIĘ i czekaj na akceptację.
- Przy niejasności API sprawdź empirycznie na małym zapytaniu i udokumentuj wniosek.
- Throttling od pierwszego zapytania testowego — również w fazie rozpoznania.