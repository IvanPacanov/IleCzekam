# ETL czasów oczekiwania NFZ (API Terminy Leczenia).
# Przykłady:
#   make fetch BENEFITS=kardiologia PROVINCES=12
#   make transform
#   make db
#   make etl-test

ETL_PROJECT = Etl/IleCzekam.Etl
BENEFITS ?= all
PROVINCES ?= 12

.PHONY: fetch transform db etl-test

fetch:
	dotnet run --project $(ETL_PROJECT) -- fetch --benefits $(BENEFITS) --provinces $(PROVINCES)

transform:
	dotnet run --project $(ETL_PROJECT) -- transform

# Baza analityczna SQLite z tabeli faktów (processed/facts.jsonl).
db:
	dotnet run --project $(ETL_PROJECT) -- db

etl-test:
	dotnet test Etl/IleCzekam.Etl.Tests
