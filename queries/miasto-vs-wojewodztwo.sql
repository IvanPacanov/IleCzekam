-- Miasto na tle województwa: o ile dni dłużej/krócej i ile razy.
-- ratio_to_province > 1 oznacza, że w mieście czeka się dłużej niż w medianie województwa.
.mode box
.headers on

SELECT city                AS miasto,
       city_median_days    AS mediana_miasta,
       province_median_days AS mediana_woj,
       diff_days           AS roznica_dni,
       ratio_to_province   AS krotnosc,
       places_with_data    AS z_danymi,
       CASE low_sample WHEN 1 THEN 'tak' ELSE '' END AS mala_proba
FROM v_city_vs_province
WHERE benefit_slug = 'kardiologia'
  AND case_type = 1
  AND month = (SELECT MAX(month) FROM city_month_stats)
ORDER BY diff_days DESC;
