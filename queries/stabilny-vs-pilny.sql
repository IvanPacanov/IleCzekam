-- Przypadek stabilny vs pilny w tej samej placówce.
-- Sprawdza, czy tryb pilny faktycznie skraca oczekiwanie i o ile.
.mode box
.headers on

SELECT f1.city                                   AS miasto,
       f1.provider                               AS placowka,
       f1.raw_days                               AS stabilny_dni,
       f2.raw_days                               AS pilny_dni,
       f1.raw_days - f2.raw_days                 AS oszczednosc_dni,
       ROUND(100.0 * (f1.raw_days - f2.raw_days)
             / NULLIF(f1.raw_days, 0), 1)        AS "skrócenie %"
FROM facts f1
JOIN facts f2
  ON  f2.month        = f1.month
  AND f2.benefit_slug = f1.benefit_slug
  AND f2.place_id     = f1.place_id
  AND f2.case_type    = 2
WHERE f1.case_type = 1
  AND f1.benefit_slug = 'kardiologia'
  AND f1.month = (SELECT MAX(month) FROM facts)
  AND f1.raw_days IS NOT NULL
  AND f2.raw_days IS NOT NULL
ORDER BY oszczednosc_dni DESC;
