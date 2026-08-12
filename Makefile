# ETL czasów oczekiwania NFZ (API Terminy Leczenia).
#
# Pełna synchronizacja (pobranie + przeliczenie + strony):
#   make sync                                  # domyślnie: wszystkie świadczenia, woj. śląskie
#   make sync PROVINCES=all                    # cała Polska, ok. 5 min
#   make sync BENEFITS=kardiologia PROVINCES=12
#
# Pojedyncze kroki: fetch / transform / db / site / etl-test.
# API NFZ jest publiczne - nie trzeba ustawiać żadnych zmiennych środowiskowych.

ETL_PROJECT = Etl/IleCzekam.Etl
UI_PROJECT = IleCzekam.UI
BENEFITS ?= all
PROVINCES ?= 12

.PHONY: help sync fetch transform db site etl-test test

# Celowo pierwsza reguła w pliku, więc domyślna dla gołego `make`. Wcześniej był tu `sync`,
# co znaczyło, że odruchowe `make` wychodziło do API NFZ i nadpisywało snapshot miesiąca.
help:
	@echo "Cele:"
	@echo "  make sync       - pełna synchronizacja: fetch + transform + db + site (SIEĆ)"
	@echo "  make fetch      - pobranie z API NFZ do data/raw/snapshots (SIEĆ)"
	@echo "  make transform  - raw + config -> processed + serving (bez sieci)"
	@echo "  make db         - baza analityczna SQLite z tabeli faktów"
	@echo "  make site       - prerender stron z data/serving"
	@echo "  make test       - testy ETL + frontendu"
	@echo ""
	@echo "Parametry: BENEFITS=$(BENEFITS) PROVINCES=$(PROVINCES)"
	@echo "  make sync PROVINCES=all   - cała Polska (ok. 5 min)"

# Pełny łańcuch. Kolejność ma znaczenie: transform czyta snapshoty z fetch,
# db czyta facts.jsonl z transform, a prerender czyta data/serving z transform.
sync: fetch transform db site

# Jedyny krok, który dotyka sieci.
fetch:
	dotnet run --project $(ETL_PROJECT) -- fetch --benefits $(BENEFITS) --provinces $(PROVINCES)

# Bez sieci, deterministyczny: nadpisuje processed i serving w całości.
transform:
	dotnet run --project $(ETL_PROJECT) -- transform

# Baza analityczna SQLite z tabeli faktów (processed/facts.jsonl).
db:
	dotnet run --project $(ETL_PROJECT) -- db

# Prerender stron z data/serving.
site:
	cd $(UI_PROJECT) && npm run build

etl-test:
	dotnet test Etl/IleCzekam.Etl.Tests

# Wszystkie testy: ETL + frontend.
test: etl-test
	cd $(UI_PROJECT) && npm test
