-- Ranking miast wewnątrz województwa: mediana czasu oczekiwania, przypadek stabilny.
-- Uruchomienie: sqlite3 -box data/analytics.sqlite < queries/ranking-miast.sql
.mode box
.headers on

SELECT rank_in_province AS lp,
       city             AS miasto,
       median_days      AS mediana_dni,
       places_total     AS placowek,
       places_with_data AS z_danymi
FROM v_city_ranking
WHERE benefit_slug = 'kardiologia'
  AND case_type = 1
  AND month = (SELECT MAX(month) FROM city_month_stats)
ORDER BY rank_in_province;
