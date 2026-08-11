-- Zmiana mediany miesiąc do miesiąca. Ma sens dopiero od DRUGIEGO snapshotu —
-- historia powstaje u nas, API NFZ zna wyłącznie stan bieżący.
.mode box
.headers on

SELECT city             AS miasto,
       month            AS miesiac,
       prev_median_days AS poprzednio_dni,
       median_days      AS teraz_dni,
       change_days      AS zmiana_dni,
       change_pct       AS "zmiana %"
FROM v_city_month_change
WHERE benefit_slug = 'kardiologia'
  AND case_type = 1
  AND prev_median_days IS NOT NULL
ORDER BY change_pct DESC;
