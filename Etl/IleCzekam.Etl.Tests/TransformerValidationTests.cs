using AwesomeAssertions;
using IleCzekam.Etl.Transform;

namespace IleCzekam.Etl.Tests;

/// <summary>
/// Każda twarda reguła walidacji, pozytywnie i negatywnie.
/// Numeracja odpowiada regułom z promptu i tabeli korekt w RECON.md, sekcja 7.
/// </summary>
[TestFixture]
public sealed class TransformerValidationTests
{
    private static readonly DateTimeOffset GeneratedAt = new(2026, 8, 11, 12, 0, 0, TimeSpan.FromHours(2));

    private static BenefitOutput Build(params QueueRecord[] records) =>
        new Transformer(TestData.Settings())
            .Build(TestData.Benefit(), [TestData.Snapshot("2026-08", records)], GeneratedAt);

    // --- 1. Brak danych ≠ krótka kolejka ---------------------------------------------------

    [Test]
    public void MissingWait_KeepsPlaceOnTheListWithPhoneAndBrakDanychBucket()
    {
        BenefitOutput output = Build(TestData.Record(pcus: null, asAt: null));

        PlaceDto place = output.City("gliwice").Places.Single();
        place.WaitStable.Bucket.Should().Be("brak_danych");
        place.WaitStable.RawDays.Should().BeNull("brak danych nigdy nie jest zerem dni");
        place.WaitStable.HumanLabel.Should().Be("brak danych");
        place.Phone.Should().NotBeNull("placówka bez danych zostaje na liście z telefonem");
        place.Flags.Should().Contain(ValidationFlag.NoData);
    }

    [Test]
    public void MissingWait_IsExcludedFromMedian()
    {
        BenefitOutput output = Build(
            TestData.Record(providerCode: "126/000001", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000002", pcus: "20 dni"),
            TestData.Record(providerCode: "126/000003", pcus: null));

        ServingFileDto city = output.City("gliwice");
        city.Summary.MedianDays.Should().Be(15, "mediana z 10 i 20, bez traktowania braku jako 0");
        city.Summary.PlacesTotal.Should().Be(3);
        city.Summary.PlacesWithData.Should().Be(2);
        city.Summary.PlacesWithoutData.Should().Be(1);
    }

    [Test]
    public void PresentWait_HasNoNoDataFlag()
    {
        PlaceDto place = Build(TestData.Record(pcus: "0 dni")).City("gliwice").Places.Single();

        place.Flags.Should().NotContain(ValidationFlag.NoData);
        place.WaitStable.RawDays.Should().Be(0);
        place.WaitStable.Bucket.Should().Be("krotko", "'0 dni' to realne 'przyjmują od ręki', nie brak danych");
    }

    // --- 1b. PCUŚ nie dotyczy (szósty kubełek) ---------------------------------------------

    [Test]
    public void NotApplicable_GetsOwnBucketNotBrakDanych()
    {
        PlaceDto place = Build(TestData.Record(pcus: "-", applicable: false)).City("gliwice").Places.Single();

        place.WaitStable.Bucket.Should().Be("nie_dotyczy");
        place.WaitStable.HumanLabel.Should().Be("nie dotyczy");
        place.Flags.Should().Contain(ValidationFlag.NotApplicable).And.NotContain(ValidationFlag.NoData);
    }

    // --- 2. Anomalie wartości --------------------------------------------------------------

    [Test]
    public void WaitOverFiveYears_IsFlaggedAndExcludedFromMedian()
    {
        BenefitOutput output = Build(
            TestData.Record(providerCode: "126/000001", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000002", pcus: "20 dni"),
            TestData.Record(providerCode: "126/000003", pcus: "160 mies."));

        ServingFileDto city = output.City("gliwice");
        city.Places.Single(p => p.WaitStable.RawDays == 4800).Flags.Should().Contain(ValidationFlag.SuspiciousValue);
        city.Summary.MedianDays.Should().Be(15, "wartość podejrzana nie wchodzi do mediany");
        city.Places.Should().HaveCount(3, "podejrzana placówka nadal jest widoczna na liście");
    }

    [Test]
    public void WaitJustBelowThreshold_IsNotFlagged()
    {
        // 60 mies. = 1800 dni < próg 1825.
        PlaceDto place = Build(TestData.Record(pcus: "60 mies.")).City("gliwice").Places.Single();

        place.Flags.Should().NotContain(ValidationFlag.SuspiciousValue);
    }

    // --- 3. Nieświeże statystyki placówki --------------------------------------------------

    [Test]
    public void StatsOlderThanThreshold_AreFlaggedStale()
    {
        // Snapshot 2026-08, statystyki 2026-03 => 5 miesięcy wstecz > próg 3.
        PlaceDto place = Build(TestData.Record(statsMonth: "2026-03")).City("gliwice").Places.Single();

        place.Flags.Should().Contain(ValidationFlag.StaleData);
        place.StatsMonth.Should().Be("2026-03", "data i tak jedzie do frontendu");
    }

    [Test]
    public void RecentStats_AreNotFlaggedStale()
    {
        PlaceDto place = Build(TestData.Record(statsMonth: "2026-07")).City("gliwice").Places.Single();

        place.Flags.Should().NotContain(ValidationFlag.StaleData);
    }

    // --- 4. Duplikaty placówek -------------------------------------------------------------

    [Test]
    public void DuplicatePlaces_AreMergedKeepingNewestSituationDate()
    {
        BenefitOutput output = Build(
            TestData.Record(pcus: "10 dni", asAt: "2026-07-01"),
            TestData.Record(pcus: "40 dni", asAt: "2026-08-07"));

        ServingFileDto city = output.City("gliwice");
        city.Places.Should().HaveCount(1, "ta sama komórka wykazana dwa razy to jedna placówka");
        city.Places.Single().WaitStable.RawDays.Should().Be(40, "wygrywa rekord z nowszą datą");
        output.Report.DuplicatesMerged.Should().Be(1);
    }

    [Test]
    public void DistinctPlaces_AreNotMerged()
    {
        BenefitOutput output = Build(
            TestData.Record(providerCode: "126/000001"),
            TestData.Record(providerCode: "126/000002"));

        output.City("gliwice").Places.Should().HaveCount(2);
        output.Report.DuplicatesMerged.Should().Be(0);
    }

    // --- 5. Mała próba ---------------------------------------------------------------------

    [Test]
    public void MedianFromFewerThanThreePlaces_IsFlaggedLowSample()
    {
        BenefitOutput output = Build(
            TestData.Record(providerCode: "126/000001", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000002", pcus: "20 dni"));

        output.City("gliwice").Summary.Flags.Should().Contain(ValidationFlag.LowSample);
    }

    [Test]
    public void MedianFromThreeOrMorePlaces_IsNotFlagged()
    {
        BenefitOutput output = Build(
            TestData.Record(providerCode: "126/000001", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000002", pcus: "20 dni"),
            TestData.Record(providerCode: "126/000003", pcus: "30 dni"));

        output.City("gliwice").Summary.Flags.Should().NotContain(ValidationFlag.LowSample);
    }

    // --- 6. Raport walidacji ---------------------------------------------------------------

    [Test]
    public void Report_CountsPlacesAndFlags()
    {
        BenefitOutput output = Build(
            TestData.Record(providerCode: "126/000001", pcus: "10 dni"),
            TestData.Record(providerCode: "126/000002", pcus: null),
            TestData.Record(providerCode: "126/000003", pcus: "160 mies."),
            TestData.Record(providerCode: "126/000004", statsMonth: "2026-01"));

        output.Report.PlacesTotal.Should().Be(4);
        output.Report.PlacesOk.Should().Be(1);
        output.Report.FlagCounts[ValidationFlag.NoData].Should().Be(1);
        output.Report.FlagCounts[ValidationFlag.SuspiciousValue].Should().Be(1);
        output.Report.FlagCounts[ValidationFlag.StaleData].Should().Be(1);
    }
}
