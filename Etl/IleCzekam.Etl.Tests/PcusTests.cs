using AwesomeAssertions;
using IleCzekam.Etl;
using IleCzekam.Etl.Transform;

namespace IleCzekam.Etl.Tests;

/// <summary>
/// PCUŚ przychodzi z API jako polski tekst, nie jako liczba — te testy pilnują
/// wszystkich siedmiu wzorców zaobserwowanych na pełnym snapshocie w fazie A.
/// </summary>
[TestFixture]
public sealed class PcusTests
{
    [TestCase("0 dni", 0)]
    [TestCase("1 dzień", 1)]
    [TestCase("9 dni", 9)]
    [TestCase("2 mies.", 60)]
    [TestCase("1 mies. 1 tydz.", 37)]
    [TestCase("3 mies. 2 tyg.", 104)]
    [TestCase("160 mies.", 4800)]
    public void ToDays_ParsesEveryObservedPattern(string pcus, int expected) =>
        Pcus.ToDays(pcus).Should().Be(expected);

    [TestCase(null)]
    [TestCase("")]
    [TestCase("-")]
    public void ToDays_ReturnsNullForMissingValue(string? pcus) =>
        Pcus.ToDays(pcus).Should().BeNull("brak wartości nigdy nie może zostać policzony jako 0 dni");

    [Test]
    public void ToDays_ThrowsOnUnknownFormat()
    {
        // Nowy format ze strony NFZ ma zatrzymać pipeline, a nie po cichu zniknąć z danych.
        Action parse = () => Pcus.ToDays("około pół roku");

        parse.Should().Throw<EtlException>().WithMessage("*Nieznany format PCUŚ*");
    }

    [TestCase("0 dni", "bez oczekiwania")]
    [TestCase("1 dzień", "ok. 1 dzień")]
    [TestCase("5 dni", "ok. 5 dni")]
    [TestCase("1 mies.", "ok. 1 miesiąc")]
    [TestCase("2 mies.", "ok. 2 miesiące")]
    [TestCase("5 mies.", "ok. 5 miesięcy")]
    [TestCase("13 mies.", "ok. 13 miesięcy")]
    [TestCase("3 mies. 1 tydz.", "ok. 3 miesiące i 1 tydzień")]
    [TestCase("3 mies. 2 tyg.", "ok. 3 miesiące i 2 tygodnie")]
    [TestCase("1 mies. 5 tyg.", "ok. 1 miesiąc i 5 tygodni")]
    [TestCase("-", "nie dotyczy")]
    [TestCase(null, "brak danych")]
    public void ToHumanLabel_BuildsLabelFromNfzTextWithPolishDeclension(string? pcus, string expected) =>
        Pcus.ToHumanLabel(pcus).Should().Be(expected);

    // Reguły zaokrągleń dla wartości WYLICZONYCH (mediany): <30 dni, 30-84 tygodnie, >=85 miesiące.
    [TestCase(0, "bez oczekiwania")]
    [TestCase(1, "ok. 1 dzień")]
    [TestCase(29, "ok. 29 dni")]
    [TestCase(30, "ok. 4 tygodnie")]
    [TestCase(84, "ok. 12 tygodni")]
    [TestCase(85, "ok. 3 miesiące")]
    [TestCase(104, "ok. 3 miesiące")]
    [TestCase(180, "ok. 6 miesięcy")]
    public void DaysToHumanLabel_AppliesRoundingRules(int days, string expected) =>
        Pcus.DaysToHumanLabel(days).Should().Be(expected);

    [Test]
    public void DaysToHumanLabel_NullIsBrakDanych() =>
        Pcus.DaysToHumanLabel(null).Should().Be("brak danych");

    [TestCase(0, WaitBucket.Krotko)]
    [TestCase(29, WaitBucket.Krotko)]
    [TestCase(30, WaitBucket.Umiarkowanie)]
    [TestCase(90, WaitBucket.Umiarkowanie)]
    [TestCase(91, WaitBucket.Dlugo)]
    [TestCase(180, WaitBucket.Dlugo)]
    [TestCase(181, WaitBucket.BardzoDlugo)]
    public void ToBucket_UsesConfiguredThresholds(int days, WaitBucket expected) =>
        Pcus.ToBucket(days, applicable: true, TestData.Settings().WaitBuckets).Should().Be(expected);

    [Test]
    public void ToBucket_MissingValueIsBrakDanych_NeverKrotko() =>
        Pcus.ToBucket(null, applicable: true, TestData.Settings().WaitBuckets)
            .Should().Be(WaitBucket.BrakDanych);

    [Test]
    public void ToBucket_NotApplicableIsSeparateBucket() =>
        Pcus.ToBucket(null, applicable: false, TestData.Settings().WaitBuckets)
            .Should().Be(WaitBucket.NieDotyczy, "hospicja i opieka domowa nie mają kolejki, to nie brak danych");
}
