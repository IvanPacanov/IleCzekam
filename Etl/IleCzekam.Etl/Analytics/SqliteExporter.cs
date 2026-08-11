using System.Text.Json;
using Microsoft.Data.Sqlite;

namespace IleCzekam.Etl.Analytics;

/// <summary>
/// Ładuje tabelę faktów (`processed/facts.jsonl`) do bazy SQLite i dolicza agregaty.
///
/// Baza jest w całości ODTWARZALNA z warstwy raw - nie jest źródłem prawdy, tylko
/// warsztatem analitycznym obok pipeline'u. Frontend jej nie dotyka: strony powstają
/// z plików `serving/`.
///
/// Mediany i percentyle są policzone RAZ, przy ładowaniu, i wylądowały w tabelach
/// `city_month_stats` / `province_month_stats`. Dzięki temu zwykłe zapytanie z konsoli
/// `sqlite3` nie musi powtarzać konstrukcji ROW_NUMBER - SQLite nie ma wbudowanej mediany.
/// </summary>
public sealed class SqliteExporter
{
    private readonly string _databasePath;

    public SqliteExporter(string databasePath)
    {
        _databasePath = databasePath;
    }

    public ExportResult Export(string factsJsonlPath)
    {
        if (!File.Exists(factsJsonlPath))
        {
            throw new EtlException($"Brak tabeli faktów: {factsJsonlPath}. Uruchom najpierw `make transform`.");
        }

        // Pełne przeładowanie - baza jest pochodną, więc nie ma czego migrować.
        if (File.Exists(_databasePath))
        {
            File.Delete(_databasePath);
        }

        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(_databasePath))!);

        // Pooling=False jest tu istotne: pula podtrzymuje uchwyt do pliku, który przed chwilą
        // skasowaliśmy, i kolejne wywołanie dostałoby połączenie do STAREJ bazy (z istniejącymi
        // już tabelami). Dla jednorazowego eksportu pula i tak nic nie daje.
        using SqliteConnection connection = new($"Data Source={_databasePath};Pooling=False");
        connection.Open();

        Execute(connection, Schema);

        int rows = LoadFacts(connection, factsJsonlPath);

        Execute(connection, Aggregates);
        Execute(connection, Views);
        Execute(connection, "ANALYZE;");

        return new ExportResult(
            rows,
            ScalarInt(connection, "SELECT COUNT(*) FROM city_month_stats"),
            ScalarInt(connection, "SELECT COUNT(*) FROM province_month_stats"),
            _databasePath);
    }

    public sealed record ExportResult(int FactRows, int CityStatRows, int ProvinceStatRows, string DatabasePath);

    // Kolumna `case` z JSON-a nazywa się w bazie `case_type` - `case` to słowo kluczowe SQL
    // i wymuszałoby cytowanie w każdym zapytaniu użytkownika.
    private const string Schema = """
        PRAGMA journal_mode = MEMORY;
        PRAGMA synchronous = OFF;

        CREATE TABLE facts (
            month               TEXT    NOT NULL,
            benefit_slug        TEXT    NOT NULL,
            benefit_label       TEXT    NOT NULL,
            nfz_benefit         TEXT    NOT NULL,
            province            TEXT    NOT NULL,
            province_name       TEXT    NOT NULL,
            city                TEXT    NOT NULL,
            city_slug           TEXT    NOT NULL,
            teryt               TEXT    NOT NULL,
            place_id            TEXT    NOT NULL,
            provider            TEXT    NOT NULL,
            provider_code       TEXT    NOT NULL,
            place               TEXT    NOT NULL,
            address             TEXT    NOT NULL,
            phone               TEXT,
            latitude            REAL,
            longitude           REAL,
            for_children        INTEGER NOT NULL,
            case_type           INTEGER NOT NULL,
            pcus_raw            TEXT,
            raw_days            INTEGER,
            bucket              TEXT    NOT NULL,
            applicable          INTEGER NOT NULL,
            as_at               TEXT,
            awaiting            INTEGER,
            removed             INTEGER,
            average_period_days INTEGER,
            stats_month         TEXT,
            no_data             INTEGER NOT NULL,
            not_applicable      INTEGER NOT NULL,
            suspicious          INTEGER NOT NULL,
            stale               INTEGER NOT NULL,
            PRIMARY KEY (month, benefit_slug, province, place_id, case_type)
        ) WITHOUT ROWID;
        """;

    private const string Aggregates = """
        CREATE INDEX idx_facts_scope   ON facts (benefit_slug, province, month, case_type);
        CREATE INDEX idx_facts_city    ON facts (city_slug, benefit_slug, month);
        CREATE INDEX idx_facts_bucket  ON facts (bucket);

        -- Agregaty miejskie. Wartości podejrzane i braki nie wchodzą do median -
        -- ta sama reguła, co w warstwie serving.
        CREATE TABLE city_month_stats AS
        WITH counts AS (
            SELECT benefit_slug, benefit_label, province, province_name, city, city_slug, teryt,
                   month, case_type,
                   COUNT(*)                                                             AS places_total,
                   SUM(CASE WHEN raw_days IS NOT NULL AND suspicious = 0 THEN 1 ELSE 0 END) AS places_with_data,
                   SUM(CASE WHEN raw_days IS NULL     THEN 1 ELSE 0 END)                AS places_without_data,
                   SUM(suspicious)                                                      AS places_suspicious,
                   SUM(stale)                                                           AS places_stale,
                   SUM(CASE WHEN bucket = 'krotko'       THEN 1 ELSE 0 END)             AS n_krotko,
                   SUM(CASE WHEN bucket = 'umiarkowanie' THEN 1 ELSE 0 END)             AS n_umiarkowanie,
                   SUM(CASE WHEN bucket = 'dlugo'        THEN 1 ELSE 0 END)             AS n_dlugo,
                   SUM(CASE WHEN bucket = 'bardzo_dlugo' THEN 1 ELSE 0 END)             AS n_bardzo_dlugo,
                   SUM(CASE WHEN bucket = 'brak_danych'  THEN 1 ELSE 0 END)             AS n_brak_danych,
                   SUM(CASE WHEN bucket = 'nie_dotyczy'  THEN 1 ELSE 0 END)             AS n_nie_dotyczy,
                   SUM(awaiting)                                                        AS sum_awaiting,
                   AVG(average_period_days)                                             AS avg_reported_period_days
            FROM facts
            GROUP BY benefit_slug, province, city_slug, month, case_type
        ),
        ranked AS (
            SELECT benefit_slug, province, city_slug, month, case_type, raw_days,
                   ROW_NUMBER() OVER (PARTITION BY benefit_slug, province, city_slug, month, case_type
                                      ORDER BY raw_days) AS rn,
                   COUNT(*)     OVER (PARTITION BY benefit_slug, province, city_slug, month, case_type) AS n
            FROM facts
            WHERE raw_days IS NOT NULL AND suspicious = 0
        ),
        quantiles AS (
            SELECT benefit_slug, province, city_slug, month, case_type,
                   -- ROUND w SQLite zaokrągla połówki „od zera”, tak samo jak
                   -- MidpointRounding.AwayFromZero w transformie - mediana w bazie
                   -- musi być co do dnia tą samą liczbą, co w warstwie serving.
                   CAST(ROUND(AVG(CASE WHEN rn IN ((n + 1) / 2, (n + 2) / 2) THEN raw_days END)) AS INTEGER) AS median_days,
                   MAX(CASE WHEN rn = MAX(1, (n * 25 + 99) / 100)  THEN raw_days END) AS p25_days,
                   MAX(CASE WHEN rn = MAX(1, (n * 75 + 99) / 100)  THEN raw_days END) AS p75_days,
                   MIN(raw_days) AS min_days,
                   MAX(raw_days) AS max_days
            FROM ranked
            GROUP BY benefit_slug, province, city_slug, month, case_type
        )
        SELECT c.*,
               q.median_days, q.p25_days, q.p75_days, q.min_days, q.max_days,
               ROUND(100.0 * c.n_krotko          / c.places_total, 1) AS pct_krotko,
               ROUND(100.0 * c.n_umiarkowanie    / c.places_total, 1) AS pct_umiarkowanie,
               ROUND(100.0 * c.n_dlugo           / c.places_total, 1) AS pct_dlugo,
               ROUND(100.0 * c.n_bardzo_dlugo    / c.places_total, 1) AS pct_bardzo_dlugo,
               ROUND(100.0 * c.n_brak_danych     / c.places_total, 1) AS pct_brak_danych,
               ROUND(100.0 * c.places_with_data  / c.places_total, 1) AS pct_z_danymi
        FROM counts c
        LEFT JOIN quantiles q
               ON  q.benefit_slug = c.benefit_slug
               AND q.province     = c.province
               AND q.city_slug    = c.city_slug
               AND q.month        = c.month
               AND q.case_type    = c.case_type;

        CREATE UNIQUE INDEX idx_city_stats ON city_month_stats (benefit_slug, province, city_slug, month, case_type);

        -- Agregaty wojewódzkie - ta sama konstrukcja, inne grupowanie.
        CREATE TABLE province_month_stats AS
        WITH counts AS (
            SELECT benefit_slug, benefit_label, province, province_name, month, case_type,
                   COUNT(*)                                                             AS places_total,
                   COUNT(DISTINCT city_slug)                                            AS cities_total,
                   SUM(CASE WHEN raw_days IS NOT NULL AND suspicious = 0 THEN 1 ELSE 0 END) AS places_with_data,
                   SUM(CASE WHEN raw_days IS NULL     THEN 1 ELSE 0 END)                AS places_without_data,
                   SUM(suspicious)                                                      AS places_suspicious,
                   SUM(CASE WHEN bucket = 'krotko'       THEN 1 ELSE 0 END)             AS n_krotko,
                   SUM(CASE WHEN bucket = 'umiarkowanie' THEN 1 ELSE 0 END)             AS n_umiarkowanie,
                   SUM(CASE WHEN bucket = 'dlugo'        THEN 1 ELSE 0 END)             AS n_dlugo,
                   SUM(CASE WHEN bucket = 'bardzo_dlugo' THEN 1 ELSE 0 END)             AS n_bardzo_dlugo,
                   SUM(CASE WHEN bucket = 'brak_danych'  THEN 1 ELSE 0 END)             AS n_brak_danych,
                   SUM(awaiting)                                                        AS sum_awaiting
            FROM facts
            GROUP BY benefit_slug, province, month, case_type
        ),
        ranked AS (
            SELECT benefit_slug, province, month, case_type, raw_days,
                   ROW_NUMBER() OVER (PARTITION BY benefit_slug, province, month, case_type
                                      ORDER BY raw_days) AS rn,
                   COUNT(*)     OVER (PARTITION BY benefit_slug, province, month, case_type) AS n
            FROM facts
            WHERE raw_days IS NOT NULL AND suspicious = 0
        ),
        quantiles AS (
            SELECT benefit_slug, province, month, case_type,
                   -- ROUND w SQLite zaokrągla połówki „od zera”, tak samo jak
                   -- MidpointRounding.AwayFromZero w transformie - mediana w bazie
                   -- musi być co do dnia tą samą liczbą, co w warstwie serving.
                   CAST(ROUND(AVG(CASE WHEN rn IN ((n + 1) / 2, (n + 2) / 2) THEN raw_days END)) AS INTEGER) AS median_days,
                   MAX(CASE WHEN rn = MAX(1, (n * 25 + 99) / 100)  THEN raw_days END) AS p25_days,
                   MAX(CASE WHEN rn = MAX(1, (n * 75 + 99) / 100)  THEN raw_days END) AS p75_days,
                   MIN(raw_days) AS min_days,
                   MAX(raw_days) AS max_days
            FROM ranked
            GROUP BY benefit_slug, province, month, case_type
        )
        SELECT c.*,
               q.median_days, q.p25_days, q.p75_days, q.min_days, q.max_days,
               ROUND(100.0 * c.n_krotko         / c.places_total, 1) AS pct_krotko,
               ROUND(100.0 * c.n_umiarkowanie   / c.places_total, 1) AS pct_umiarkowanie,
               ROUND(100.0 * c.n_dlugo          / c.places_total, 1) AS pct_dlugo,
               ROUND(100.0 * c.n_bardzo_dlugo   / c.places_total, 1) AS pct_bardzo_dlugo,
               ROUND(100.0 * c.n_brak_danych    / c.places_total, 1) AS pct_brak_danych,
               ROUND(100.0 * c.places_with_data / c.places_total, 1) AS pct_z_danymi
        FROM counts c
        LEFT JOIN quantiles q
               ON  q.benefit_slug = c.benefit_slug
               AND q.province     = c.province
               AND q.month        = c.month
               AND q.case_type    = c.case_type;

        CREATE UNIQUE INDEX idx_province_stats ON province_month_stats (benefit_slug, province, month, case_type);
        """;

    private const string Views = """
        -- Miasto na tle województwa: różnica i stosunek median.
        CREATE VIEW v_city_vs_province AS
        SELECT c.benefit_slug, c.month, c.case_type, c.province_name, c.city, c.city_slug,
               c.places_total, c.places_with_data,
               c.median_days                                     AS city_median_days,
               p.median_days                                     AS province_median_days,
               c.median_days - p.median_days                     AS diff_days,
               ROUND(1.0 * c.median_days / NULLIF(p.median_days, 0), 2) AS ratio_to_province,
               CASE WHEN c.places_with_data < 3 THEN 1 ELSE 0 END AS low_sample
        FROM city_month_stats c
        JOIN province_month_stats p
          ON  p.benefit_slug = c.benefit_slug
          AND p.province     = c.province
          AND p.month        = c.month
          AND p.case_type    = c.case_type;

        -- Zmiana miesiąc do miesiąca. Ma sens dopiero od drugiego snapshotu.
        CREATE VIEW v_city_month_change AS
        SELECT benefit_slug, case_type, province_name, city, city_slug, month,
               median_days,
               LAG(median_days) OVER w                                AS prev_median_days,
               median_days - LAG(median_days) OVER w                  AS change_days,
               ROUND(100.0 * (median_days - LAG(median_days) OVER w)
                     / NULLIF(LAG(median_days) OVER w, 0), 1)         AS change_pct
        FROM city_month_stats
        WINDOW w AS (PARTITION BY benefit_slug, city_slug, case_type ORDER BY month);

        -- Rozkład kubełków w formacie długim - wygodne pod wykresy.
        CREATE VIEW v_bucket_shares AS
        SELECT benefit_slug, month, case_type, province_name, city, city_slug, bucket, n, places_total,
               ROUND(100.0 * n / places_total, 1) AS pct
        FROM (
            SELECT benefit_slug, month, case_type, province_name, city, city_slug, places_total, 'krotko'       AS bucket, n_krotko       AS n FROM city_month_stats
            UNION ALL SELECT benefit_slug, month, case_type, province_name, city, city_slug, places_total, 'umiarkowanie', n_umiarkowanie FROM city_month_stats
            UNION ALL SELECT benefit_slug, month, case_type, province_name, city, city_slug, places_total, 'dlugo',        n_dlugo        FROM city_month_stats
            UNION ALL SELECT benefit_slug, month, case_type, province_name, city, city_slug, places_total, 'bardzo_dlugo', n_bardzo_dlugo FROM city_month_stats
            UNION ALL SELECT benefit_slug, month, case_type, province_name, city, city_slug, places_total, 'brak_danych',  n_brak_danych  FROM city_month_stats
            UNION ALL SELECT benefit_slug, month, case_type, province_name, city, city_slug, places_total, 'nie_dotyczy',  n_nie_dotyczy  FROM city_month_stats
        );

        -- Ranking miast wewnątrz województwa dla najnowszego snapshotu.
        CREATE VIEW v_city_ranking AS
        SELECT benefit_slug, case_type, province_name, city, city_slug, month,
               median_days, places_total, places_with_data,
               RANK() OVER (PARTITION BY benefit_slug, province, month, case_type
                            ORDER BY median_days) AS rank_in_province
        FROM city_month_stats
        WHERE median_days IS NOT NULL;
        """;

    private static int LoadFacts(SqliteConnection connection, string factsJsonlPath)
    {
        using SqliteTransaction transaction = connection.BeginTransaction();
        using SqliteCommand insert = connection.CreateCommand();
        insert.Transaction = transaction;
        insert.CommandText = """
            INSERT OR REPLACE INTO facts VALUES (
                $month, $benefit_slug, $benefit_label, $nfz_benefit, $province, $province_name,
                $city, $city_slug, $teryt, $place_id, $provider, $provider_code, $place, $address,
                $phone, $latitude, $longitude, $for_children, $case_type, $pcus_raw, $raw_days,
                $bucket, $applicable, $as_at, $awaiting, $removed, $average_period_days,
                $stats_month, $no_data, $not_applicable, $suspicious, $stale);
            """;

        string[] parameters =
        [
            "month", "benefit_slug", "benefit_label", "nfz_benefit", "province", "province_name",
            "city", "city_slug", "teryt", "place_id", "provider", "provider_code", "place", "address",
            "phone", "latitude", "longitude", "for_children", "case_type", "pcus_raw", "raw_days",
            "bucket", "applicable", "as_at", "awaiting", "removed", "average_period_days",
            "stats_month", "no_data", "not_applicable", "suspicious", "stale",
        ];

        foreach (string name in parameters)
        {
            insert.Parameters.Add(new SqliteParameter($"${name}", SqliteType.Text));
        }

        int rows = 0;

        foreach (string line in File.ReadLines(factsJsonlPath))
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            using JsonDocument document = JsonDocument.Parse(line);
            JsonElement fact = document.RootElement;

            foreach (string name in parameters)
            {
                // W JSON-ie kolumna nazywa się `case`; w bazie `case_type` (słowo kluczowe SQL).
                string jsonName = name == "case_type" ? "case" : name;
                insert.Parameters[$"${name}"].Value = ToSqlite(fact, jsonName);
            }

            insert.ExecuteNonQuery();
            rows++;
        }

        transaction.Commit();
        return rows;
    }

    private static object ToSqlite(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out JsonElement value))
        {
            return DBNull.Value;
        }

        return value.ValueKind switch
        {
            JsonValueKind.Null or JsonValueKind.Undefined => DBNull.Value,
            JsonValueKind.True => 1L,
            JsonValueKind.False => 0L,
            JsonValueKind.Number => value.TryGetInt64(out long number) ? number : value.GetDouble(),
            _ => value.GetString() ?? (object)DBNull.Value,
        };
    }

    private static void Execute(SqliteConnection connection, string sql)
    {
        using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        command.ExecuteNonQuery();
    }

    private static int ScalarInt(SqliteConnection connection, string sql)
    {
        using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        return Convert.ToInt32(command.ExecuteScalar());
    }
}
