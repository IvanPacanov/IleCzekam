using AwesomeAssertions;
using IleCzekam.Etl.Common;
using IleCzekam.Etl.Transform;

namespace IleCzekam.Etl.Tests;

/// <summary>Agregaty, porównania, trend ze snapshotów i scalanie przypadku pilnego.</summary>
[TestFixture]
public sealed class TransformerAggregateTests
{
    private static readonly DateTimeOffset GeneratedAt = new(2026, 8, 11, 12, 0, 0, TimeSpan.FromHours(2));

    private static BenefitOutput Build(params MonthSnapshot[] months) =>
        new Transformer(TestData.Settings()).Build(TestData.Benefit(), months, GeneratedAt);

    [Test]
    public void Trend_IsBuiltFromEveryMonthlySnapshot()
    {
        BenefitOutput output = Build(
            TestData.Snapshot("2026-06", TestData.Record(pcus: "2 mies.")),
            TestData.Snapshot("2026-07", TestData.Record(pcus: "1 mies.")),
            TestData.Snapshot("2026-08", TestData.Record(pcus: "10 dni")));

        ServingFileDto city = output.City("gliwice");

        city.SnapshotMonth.Should().Be("2026-08", "bieżące dane to najnowszy snapshot");
        city.Trend.Select(t => t.Month).Should().Equal("2026-06", "2026-07", "2026-08");
        city.Trend.Select(t => t.MedianDays).Should().Equal(60, 30, 10);
        city.Summary.MedianDays.Should().Be(10);
    }

    [Test]
    public void Trend_CountsPlacesWithDataPerMonth()
    {
        BenefitOutput output = Build(
            TestData.Snapshot("2026-07",
                TestData.Record(providerCode: "126/000001", pcus: "10 dni"),
                TestData.Record(providerCode: "126/000002", pcus: null)),
            TestData.Snapshot("2026-08",
                TestData.Record(providerCode: "126/000001", pcus: "12 dni"),
                TestData.Record(providerCode: "126/000002", pcus: "20 dni")));

        output.City("gliwice").Trend.Select(t => t.PlacesWithData).Should().Equal(1, 2);
    }

    [Test]
    public void UrgentCase_IsMergedIntoTheSamePlace()
    {
        BenefitOutput output = Build(TestData.Snapshot("2026-08",
            TestData.Record(pcus: "3 mies.", @case: 1),
            TestData.Record(pcus: "14 dni", @case: 2)));

        PlaceDto place = output.City("gliwice").Places.Single();

        place.WaitStable.RawDays.Should().Be(90);
        place.WaitUrgent!.RawDays.Should().Be(14, "przypadek pilny to ta sama placówka, nie druga pozycja");
    }

    [Test]
    public void CityAndProvinceAggregates_AreBuiltSeparately()
    {
        BenefitOutput output = Build(TestData.Snapshot("2026-08",
            TestData.Record(providerCode: "126/000001", locality: "GLIWICE", teryt: "2466011", pcus: "100 dni"),
            TestData.Record(providerCode: "126/000002", locality: "KATOWICE", teryt: "2469011", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000003", locality: "KATOWICE", teryt: "2469011", pcus: "20 dni")));

        output.City("gliwice").Summary.MedianDays.Should().Be(100);
        output.City("katowice").Summary.MedianDays.Should().Be(15);
        output.Province().Summary.MedianDays.Should().Be(20, "mediana z 10, 20, 100");
        output.Province().Summary.PlacesTotal.Should().Be(3);
    }

    [Test]
    public void Comparison_PointsAtFastestCityInProvince()
    {
        BenefitOutput output = Build(TestData.Snapshot("2026-08",
            TestData.Record(providerCode: "126/000001", locality: "GLIWICE", teryt: "2466011", pcus: "100 dni"),
            TestData.Record(providerCode: "126/000002", locality: "KATOWICE", teryt: "2469011", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000003", locality: "KATOWICE", teryt: "2469011", pcus: "20 dni"),
            TestData.Record(providerCode: "126/000004", locality: "KATOWICE", teryt: "2469011", pcus: "30 dni")));

        ComparisonDto comparison = output.City("gliwice").Comparison;

        comparison.ScopeMedianDays.Should().Be(100);
        comparison.ProvinceMedianDays.Should().Be(25, "mediana z 10, 20, 30, 100 to średnia dwóch środkowych");
        comparison.BestCityInProvince!.Slug.Should().Be("katowice");
        comparison.BestCityInProvince.MedianDays.Should().Be(20);
        comparison.BestCityInProvince.LowSample.Should().BeFalse();
    }

    [Test]
    public void BestCity_FallsBackToSmallSampleButSaysSo()
    {
        BenefitOutput output = Build(TestData.Snapshot("2026-08",
            TestData.Record(providerCode: "126/000001", locality: "GLIWICE", teryt: "2466011", pcus: "100 dni"),
            TestData.Record(providerCode: "126/000002", locality: "USTROŃ", teryt: "2402041", pcus: "5 dni")));

        BestCityDto best = output.City("gliwice").Comparison.BestCityInProvince!;

        best.Slug.Should().Be("ustron");
        best.LowSample.Should().BeTrue("żadne miasto nie ma próby >= 3, więc mówimy o tym wprost");
    }

    [Test]
    public void Fastest_SkipsSuspiciousAndMissingValues()
    {
        BenefitOutput output = Build(TestData.Snapshot("2026-08",
            TestData.Record(providerCode: "126/000001", pcus: null),
            TestData.Record(providerCode: "126/000002", pcus: "160 mies."),
            TestData.Record(providerCode: "126/000003", pcus: "8 dni"),
            TestData.Record(providerCode: "126/000004", pcus: "40 dni")));

        FastestDto fastest = output.City("gliwice").Summary.Fastest!;

        fastest.RawDays.Should().Be(8);
        fastest.HumanLabel.Should().Be("ok. 8 dni");
    }

    [Test]
    public void PlaceId_IsStableAcrossSnapshots()
    {
        BenefitOutput output = Build(
            TestData.Snapshot("2026-07", TestData.Record(pcus: "1 mies.")),
            TestData.Snapshot("2026-08", TestData.Record(pcus: "2 mies.")));

        // Ten sam klucz biznesowy => ten sam id, inaczej trend rozjechałby się między miesiącami.
        output.ProcessedFiles.Select(f => f.File.Places.Single().Id).Distinct().Should().HaveCount(1);
    }

    [Test]
    public void EveryFileCarriesNfzAttribution()
    {
        BenefitOutput output = Build(TestData.Snapshot("2026-08", TestData.Record()));

        output.ServingFiles.Should().OnlyContain(f => f.File.Source.Url == "https://api.nfz.gov.pl/");
    }

    [Test]
    public void SearchIndex_HasOneEntryPerCityWithSynonyms()
    {
        BenefitOutput output = Build(TestData.Snapshot("2026-08",
            TestData.Record(providerCode: "126/000001", locality: "GLIWICE", teryt: "2466011"),
            TestData.Record(providerCode: "126/000002", locality: "KATOWICE", teryt: "2469011")));

        output.SearchEntries.Select(e => e.CitySlug).Should().BeEquivalentTo(["gliwice", "katowice"]);
        output.SearchEntries.Should().OnlyContain(e => e.Synonyms.Contains("serce"));
    }

    [TestCase("GLIWICE", "gliwice")]
    [TestCase("BIELSKO-BIAŁA", "bielsko-biala")]
    [TestCase("DĄBROWA GÓRNICZA", "dabrowa-gornicza")]
    [TestCase("JASTRZĘBIE-ZDRÓJ", "jastrzebie-zdroj")]
    [TestCase("ZAKŁAD/OŚRODEK REHABILITACJI", "zaklad-osrodek-rehabilitacji")]
    public void Slug_TransliteratesPolishCharacters(string input, string expected) =>
        Slug.From(input).Should().Be(expected);
}
