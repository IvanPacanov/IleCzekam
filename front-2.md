# PROMPT DLA AGENTA KODUJĄCEGO — KOREKTA W ISTNIEJĄCYM KODZIE ILECZEKAM.PL (2 zadania)

Pracujesz w istniejącym repozytorium ileczekam.pl (Angular). Frontend jest już zbudowany — NIE przebudowujesz niczego poza zakresem poniżej. Zanim zaczniesz: przejrzyj istniejącą strukturę tras, komponentów i tokenów, i dostosuj się do konwencji zastanych w kodzie.

## Zadanie 1 — "Popularne miasta" w górnym menu (droga do stron miast dla zwykłego użytkownika)

Strony `/{swiadczenie}/{miasto}` są dziś osiągalne głównie z zewnątrz (Google/linki). Dodaj widoczną drogę z wnętrza serwisu:

- Pozycja **"Popularne miasta"** w górnej nawigacji na KAŻDYM widoku (główna, wyniki, strona miasta) — jeśli nawigacja jest wspólnym komponentem, wystarczy jedno miejsce; jeśli nie, ujednolić do wspólnego komponentu przy okazji.
- Interakcja: desktop — rozwijany panel pod pozycją menu; mobile — pełnoekranowy arkusz. Zawartość: lista ~16 największych miast (stała lista w konfiguracji/danych, nie hardkod w szablonie); po wyborze miasta — lista popularnych świadczeń w nim ("Kardiolog w Gliwicach", "Ortopeda w Gliwicach"...), każde linkuje do istniejącej strony `/{swiadczenie}/{miasto}`. Maksymalnie 2 kliknięcia od otwarcia panelu do strony świadczenia.
- Pokazuj tylko pary (miasto, świadczenie), które realnie istnieją w danych/prerenderze — żadnych linków do 404. Źródło listy: katalog serving / istniejący indeks tras prerenderu.
- Dostępność: panel obsługiwany klawiaturą (Escape zamyka, fokus trafia do panelu przy otwarciu i wraca po zamknięciu), aria-expanded na przycisku menu.
- Panel jako wyspa `@defer` — nie może dokładać się do initial bundle prerenderowanych stron.

## Zadanie 2 — naprawa widoku wyników (`/szukaj`): rozjechany layout i niespójne ustawienia

Widok wyników rozjechał się względem reszty serwisu (inne ustawienia/wygląd elementów niż w zatwierdzonym wzorcu). Przywróć spójność:

1. **Zdiagnozuj przyczynę zamiast łatać objawy:** porównaj style karty placówki, pigułki czasu i panelu filtrów na `/szukaj` ze stroną miasta. Ustal, czy rozjazd wynika z (a) zdublowanych komponentów/styli zamiast współdzielonych, (b) lokalnych nadpisań tokenów, (c) osobnych wartości spacingu wpisanych na sztywno. Wynik diagnozy opisz w podsumowaniu.
2. **Ujednolić przez współdzielenie, nie kopiowanie:** karta placówki, pigułka czasu i pasek "Dane NFZ aktualizowane raz w miesiącu..." mają być JEDNYMI komponentami używanymi przez oba widoki. Jeśli istnieją duplikaty — skonsoliduj do wspólnego komponentu i usuń kopie.
3. **Kanoniczny układ karty placówki (obowiązuje wszędzie):** nazwa (maks. 2 linie, ellipsis) → adres + odległość → oś [pigułka czasu][przycisk telefonu] → liczba oczekujących · data danych. Telefon: `href="tel:..."`, min. 48 px wysokości, na mobile pełna szerokość karty.
4. **Odległość jednolita na całej liście:** z geolokalizacją "X km od Ciebie", bez niej "X km od {miasto}" — nigdy miks obu wariantów w jednej liście (jeden punkt odniesienia ustalany raz per wyszukiwanie).
5. **Panel filtrów w kolejności:** Przypadek → Promień → Sortowanie; boks "Gotów wyjechać?" pod filtrami (desktop) / po 3. karcie listy (mobile). Jeśli boks ma treść na sztywno ("krótsze nawet o pół roku") — zamień na wyliczaną z danych bieżącego wyszukiwania ("Poza promieniem {X} km najkrótszy termin to {czas} — o {różnica} krócej") i ukrywaj boks, gdy różnica < 30 dni.
6. Sprawdź widok w 390 px po zmianach: zero poziomego scrolla, karta kompletna.

## Zabezpieczenie przed kolejnym rozjazdem

Po konsolidacji dodaj testy snapshot/DOM dla współdzielonej karty placówki i pigułki (wszystkie buckety + brak danych) oraz test, że oba widoki renderują TEN SAM komponent karty (np. przez selektor komponentu). To jest ważniejsze niż kosmetyka — ma uniemożliwić ponowne rozjechanie.

## Czego nie robić

- Nie zmieniaj tokenów kolorów, typografii ani zachowania routingu.
- Nie ruszaj strony głównej i strony miasta poza dodaniem wspólnej nawigacji.
- Nie dodawaj funkcji spoza listy.

## Kryteria akceptacji

- [ ] "Popularne miasta" działa na wszystkich widokach, desktop + mobile, tylko istniejące pary, klawiatura + aria.
- [ ] Initial bundle prerenderowanych stron bez wzrostu (panel w @defer) — porównaj rozmiary przed/po.
- [ ] `/szukaj` używa tych samych komponentów karty/pigułki/paska co strona miasta — zero duplikatów w kodzie.
- [ ] Odległości jednolite; boks "Gotów wyjechać?" dynamiczny z progiem ukrywania.
- [ ] 390 px bez poziomego scrolla na `/szukaj`.
- [ ] Testy współdzielenia komponentów przechodzą; diagnoza przyczyny rozjazdu opisana w podsumowaniu.