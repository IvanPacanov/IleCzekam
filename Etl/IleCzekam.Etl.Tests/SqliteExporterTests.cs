using System.Text.Json;
using AwesomeAssertions;
using IleCzekam.Etl;
using IleCzekam.Etl.Analytics;
using IleCzekam.Etl.Transform;
using Microsoft.Data.Sqlite;

namespace IleCzekam.Etl.Tests;

/// <summary>
/// Baza analityczna jest pochodną tabeli faktów. Najważniejszy test to ten, który pilnuje,
/// żeby mediana z SQL-a i mediana z transformu były TĄ SAMĄ liczbą - inaczej serwis
/// i analizy mówiłyby o tej samej metryce co innego.
/// </summary>
[TestFixture]
public sealed class SqliteExporterTests
{
    private static readonly DateTimeOffset GeneratedAt = new(2026, 8, 11, 12, 0, 0, TimeSpan.FromHours(2));

    private string _directory = string.Empty;

    [SetUp]
    public void SetUp()
    {
        _directory = Path.Combine(Path.GetTempPath(), $"ileczekam-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_directory);
    }

    [TearDown]
    public void TearDown()
    {
        SqliteConnection.ClearAllPools();

        if (Directory.Exists(_directory))
        {
            Directory.Delete(_directory, recursive: true);
        }
    }

    /// <summary>Buduje bazę z faktów wyprodukowanych przez transform i zwraca połączenie.</summary>
    private (SqliteConnection Connection, BenefitOutput Output) BuildDatabase(params MonthSnapshot[] months)
    {
        BenefitOutput output = new Transformer(TestData.Settings())
            .Build(TestData.Benefit(), months, GeneratedAt);

        string factsPath = Path.Combine(_directory, "facts.jsonl");
        File.WriteAllLines(factsPath, output.Facts.Select(f => JsonSerializer.Serialize(f)));

        string databasePath = Path.Combine(_directory, "analytics.sqlite");
        new SqliteExporter(databasePath).Export(factsPath);

        SqliteConnection connection = new($"Data Source={databasePath}");
        connection.Open();
        return (connection, output);
    }

    private static T? Scalar<T>(SqliteConnection connection, string sql)
    {
        using SqliteCommand command = connection.CreateCommand();
        command.CommandText = sql;
        object? value = command.ExecuteScalar();

        if (value is null or DBNull)
        {
            return default;
        }

        // SQLite zwraca liczby jako Int64/Double - Convert.ChangeType nie umie w Nullable<T>.
        Type target = Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T);
        return (T)Convert.ChangeType(value, target);
    }

    [Test]
    public void Median_InSqlite_MatchesTransformerMedian()
    {
        // Parzysta liczba wartości => mediana wypada „w połowie” i ujawnia różnice zaokrągleń.
        (SqliteConnection connection, BenefitOutput output) = BuildDatabase(TestData.Snapshot("2026-08",
            TestData.Record(providerCode: "126/000001", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000002", pcus: "20 dni"),
            TestData.Record(providerCode: "126/000003", pcus: "31 dni"),
            TestData.Record(providerCode: "126/000004", pcus: "40 dni")));

        using (connection)
        {
            int? fromSql = Scalar<int?>(connection,
                "SELECT median_days FROM city_month_stats WHERE city_slug='gliwice' AND case_type=1");

            fromSql.Should().Be(26, "mediana z 20 i 31 to 25,5 zaokrąglone od zera");
            fromSql.Should().Be(output.City("gliwice").Summary.MedianDays);
        }
    }

    [Test]
    public void Median_MatchesTransformer_AcrossEveryCity()
    {
        (SqliteConnection connection, BenefitOutput output) = BuildDatabase(TestData.Snapshot("2026-08",
            TestData.Record(providerCode: "126/000001", locality: "GLIWICE", teryt: "2466011", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000002", locality: "GLIWICE", teryt: "2466011", pcus: "3 mies."),
            TestData.Record(providerCode: "126/000003", locality: "KATOWICE", teryt: "2469011", pcus: "1 mies. 2 tyg."),
            TestData.Record(providerCode: "126/000004", locality: "KATOWICE", teryt: "2469011", pcus: "5 dni"),
            TestData.Record(providerCode: "126/000005", locality: "KATOWICE", teryt: "2469011", pcus: null)));

        using (connection)
        {
            foreach (string slug in new[] { "gliwice", "katowice" })
            {
                Scalar<int?>(connection, $"SELECT median_days FROM city_month_stats WHERE city_slug='{slug}' AND case_type=1")
                    .Should().Be(output.City(slug).Summary.MedianDays, $"miasto {slug}");
            }

            Scalar<int?>(connection, "SELECT median_days FROM province_month_stats WHERE case_type=1")
                .Should().Be(output.Province().Summary.MedianDays);
        }
    }

    [Test]
    public void SuspiciousValues_AreExcludedFromMedianButCountedInTotals()
    {
        (SqliteConnection connection, _) = BuildDatabase(TestData.Snapshot("2026-08",
            TestData.Record(providerCode: "126/000001", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000002", pcus: "20 dni"),
            TestData.Record(providerCode: "126/000003", pcus: "160 mies.")));

        using (connection)
        {
            Scalar<int?>(connection, "SELECT median_days FROM city_month_stats WHERE case_type=1").Should().Be(15);
            Scalar<int>(connection, "SELECT places_total FROM city_month_stats WHERE case_type=1").Should().Be(3);
            Scalar<int>(connection, "SELECT places_suspicious FROM city_month_stats WHERE case_type=1").Should().Be(1);
            Scalar<int>(connection, "SELECT places_with_data FROM city_month_stats WHERE case_type=1").Should().Be(2);
        }
    }

    [Test]
    public void MissingValues_AreCountedButNeverTreatedAsZero()
    {
        (SqliteConnection connection, _) = BuildDatabase(TestData.Snapshot("2026-08",
            TestData.Record(providerCode: "126/000001", pcus: "40 dni"),
            TestData.Record(providerCode: "126/000002", pcus: null)));

        using (connection)
        {
            Scalar<int?>(connection, "SELECT median_days FROM city_month_stats WHERE case_type=1")
                .Should().Be(40, "brak danych nie może obniżyć mediany jak zero");
            Scalar<int>(connection, "SELECT places_without_data FROM city_month_stats WHERE case_type=1").Should().Be(1);
            Scalar<double>(connection, "SELECT pct_brak_danych FROM city_month_stats WHERE case_type=1").Should().Be(50.0);
        }
    }

    [Test]
    public void BucketShares_SumTo100Percent()
    {
        (SqliteConnection connection, _) = BuildDatabase(TestData.Snapshot("2026-08",
            TestData.Record(providerCode: "126/000001", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000002", pcus: "60 dni"),
            TestData.Record(providerCode: "126/000003", pcus: "120 dni"),
            TestData.Record(providerCode: "126/000004", pcus: "300 dni"),
            TestData.Record(providerCode: "126/000005", pcus: null)));

        using (connection)
        {
            Scalar<double>(connection,
                    "SELECT SUM(pct) FROM v_bucket_shares WHERE city_slug='gliwice' AND case_type=1")
                .Should().BeApproximately(100.0, 0.3);

            Scalar<double>(connection, "SELECT pct_krotko FROM city_month_stats WHERE case_type=1").Should().Be(20.0);
        }
    }

    [Test]
    public void Percentiles_UseNearestRank()
    {
        (SqliteConnection connection, _) = BuildDatabase(TestData.Snapshot("2026-08",
            TestData.Record(providerCode: "126/000001", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000002", pcus: "20 dni"),
            TestData.Record(providerCode: "126/000003", pcus: "30 dni"),
            TestData.Record(providerCode: "126/000004", pcus: "40 dni")));

        using (connection)
        {
            Scalar<int>(connection, "SELECT p25_days FROM city_month_stats WHERE case_type=1").Should().Be(10);
            Scalar<int>(connection, "SELECT p75_days FROM city_month_stats WHERE case_type=1").Should().Be(30);
            Scalar<int>(connection, "SELECT min_days FROM city_month_stats WHERE case_type=1").Should().Be(10);
            Scalar<int>(connection, "SELECT max_days FROM city_month_stats WHERE case_type=1").Should().Be(40);
        }
    }

    [Test]
    public void MonthOverMonthChange_IsComputedFromSnapshots()
    {
        (SqliteConnection connection, _) = BuildDatabase(
            TestData.Snapshot("2026-07", TestData.Record(pcus: "20 dni")),
            TestData.Snapshot("2026-08", TestData.Record(pcus: "30 dni")));

        using (connection)
        {
            Scalar<int>(connection,
                    "SELECT change_days FROM v_city_month_change WHERE month='2026-08' AND case_type=1")
                .Should().Be(10);

            Scalar<double>(connection,
                    "SELECT change_pct FROM v_city_month_change WHERE month='2026-08' AND case_type=1")
                .Should().Be(50.0);
        }
    }

    [Test]
    public void CityVsProvince_ExposesDifferenceAndLowSampleFlag()
    {
        (SqliteConnection connection, _) = BuildDatabase(TestData.Snapshot("2026-08",
            TestData.Record(providerCode: "126/000001", locality: "GLIWICE", teryt: "2466011", pcus: "100 dni"),
            TestData.Record(providerCode: "126/000002", locality: "KATOWICE", teryt: "2469011", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000003", locality: "KATOWICE", teryt: "2469011", pcus: "20 dni"),
            TestData.Record(providerCode: "126/000004", locality: "KATOWICE", teryt: "2469011", pcus: "30 dni")));

        using (connection)
        {
            Scalar<int>(connection, "SELECT diff_days FROM v_city_vs_province WHERE city_slug='gliwice' AND case_type=1")
                .Should().Be(75, "mediana miasta 100 minus mediana województwa 25");
            Scalar<int>(connection, "SELECT low_sample FROM v_city_vs_province WHERE city_slug='gliwice' AND case_type=1")
                .Should().Be(1);
            Scalar<int>(connection, "SELECT low_sample FROM v_city_vs_province WHERE city_slug='katowice' AND case_type=1")
                .Should().Be(0);
        }
    }

    [Test]
    public void UrgentCase_IsSeparateRowNotMixedIntoStableStats()
    {
        (SqliteConnection connection, _) = BuildDatabase(TestData.Snapshot("2026-08",
            TestData.Record(pcus: "90 dni", @case: 1),
            TestData.Record(pcus: "10 dni", @case: 2)));

        using (connection)
        {
            Scalar<int?>(connection, "SELECT median_days FROM city_month_stats WHERE case_type=1").Should().Be(90);
            Scalar<int?>(connection, "SELECT median_days FROM city_month_stats WHERE case_type=2").Should().Be(10);
            Scalar<int>(connection, "SELECT COUNT(*) FROM facts").Should().Be(2);
        }
    }

    [Test]
    public void Reload_IsIdempotent()
    {
        string factsPath = Path.Combine(_directory, "facts.jsonl");
        string databasePath = Path.Combine(_directory, "analytics.sqlite");

        BenefitOutput output = new Transformer(TestData.Settings())
            .Build(TestData.Benefit(), [TestData.Snapshot("2026-08", TestData.Record())], GeneratedAt);
        File.WriteAllLines(factsPath, output.Facts.Select(f => JsonSerializer.Serialize(f)));

        SqliteExporter exporter = new(databasePath);
        SqliteExporter.ExportResult first = exporter.Export(factsPath);
        SqliteExporter.ExportResult second = exporter.Export(factsPath);

        second.FactRows.Should().Be(first.FactRows, "ponowne ładowanie odtwarza bazę, nie dokłada wierszy");
        second.CityStatRows.Should().Be(first.CityStatRows);
    }

    [Test]
    public void MissingFactsFile_FailsWithActionableMessage()
    {
        Action export = () => new SqliteExporter(Path.Combine(_directory, "db.sqlite"))
            .Export(Path.Combine(_directory, "nie-ma.jsonl"));

        export.Should().Throw<EtlException>().WithMessage("*make transform*");
    }
}
