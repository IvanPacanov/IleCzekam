-- Rozkład procentowy kubełków czasu oczekiwania w województwie.
-- Pokazuje, jaki odsetek placówek mieści się w każdym progu z config/settings.yml.
.mode box
.headers on

SELECT province_name        AS wojewodztwo,
       month                AS miesiac,
       places_total         AS placowek,
       pct_krotko           AS "krótko %",
       pct_umiarkowanie     AS "umiark. %",
       pct_dlugo            AS "długo %",
       pct_bardzo_dlugo     AS "b.długo %",
       pct_brak_danych      AS "brak danych %"
FROM province_month_stats
WHERE benefit_slug = 'kardiologia' AND case_type = 1
ORDER BY month, province_name;

-- To samo per miasto, w formacie długim (pod wykresy).
SELECT city AS miasto, bucket AS kubelek, n AS placowek, pct AS "udzial %"
FROM v_bucket_shares
WHERE benefit_slug = 'kardiologia'
  AND case_type = 1
  AND month = (SELECT MAX(month) FROM city_month_stats)
  AND n > 0
ORDER BY miasto, pct DESC;
