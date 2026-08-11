using AwesomeAssertions;
using IleCzekam.Etl.Configuration;

namespace IleCzekam.Etl.Tests;

/// <summary>
/// Testy czytają prawdziwe pliki z config/ — pilnują, żeby literówka w YAML-u
/// nie przeszła niezauważona. Zero ruchu sieciowego.
/// </summary>
[TestFixture]
public sealed class ConfigLoaderTests
{
    private static string ConfigDir
    {
        get
        {
            DirectoryInfo? dir = new(TestContext.CurrentContext.TestDirectory);

            while (dir is not null && !Directory.Exists(Path.Combine(dir.FullName, "config")))
            {
                dir = dir.Parent;
            }

            return dir is null
                ? throw new DirectoryNotFoundException("Nie znaleziono katalogu config/ w żadnym katalogu nadrzędnym.")
                : Path.Combine(dir.FullName, "config");
        }
    }

    [Test]
    public void LoadSettings_ReadsApiAndProvinces()
    {
        EtlSettings settings = ConfigLoader.LoadSettings(ConfigDir);

        // Faza A ustaliła: v1.3 pod api.nfz.gov.pl jest wycofane, obowiązuje v1.4 (PCUŚ).
        settings.Api.BaseUrl.Should().Contain("app-itl-api-pcus");
        settings.Api.PageLimit.Should().Be(25, "API odrzuca limit > 25 błędem HTTP 400");
        settings.Api.ThrottleMs.Should().BeGreaterThan(100, "regulamin NFZ dopuszcza 10 zapytań/s");
        settings.Paths.Raw.Should().NotBeEmpty();
    }

    [Test]
    public void LoadSettings_ProvincesAreNfzBranchCodes()
    {
        EtlSettings settings = ConfigLoader.LoadSettings(ConfigDir);

        settings.Provinces.Should().HaveCount(16);
        settings.Provinces.Should().Contain("12", "śląskie to oddział NFZ 12, a nie TERYT 24");
        settings.Provinces.Should().NotContain("24");
        settings.Provinces.Should().OnlyContain(code => code.Length == 2);
    }

    [Test]
    public void LoadSettings_WaitBucketThresholdsAreAscending()
    {
        WaitBucketsSettings buckets = ConfigLoader.LoadSettings(ConfigDir).WaitBuckets;

        buckets.KrotkoMaxDays.Should().BeLessThan(buckets.UmiarkowanieMaxDays);
        buckets.UmiarkowanieMaxDays.Should().BeLessThan(buckets.DlugoMaxDays);
    }

    [Test]
    public void LoadBenefits_EveryBenefitHasSlugLabelAndNfzNames()
    {
        BenefitsConfig config = ConfigLoader.LoadBenefits(ConfigDir);

        config.Benefits.Should().NotBeEmpty();

        foreach (BenefitConfig benefit in config.Benefits)
        {
            benefit.Slug.Should().NotBeEmpty();
            benefit.Label.Should().NotBeEmpty();
            benefit.NfzBenefits.Should().NotBeEmpty($"świadczenie '{benefit.Slug}' bez nazw NFZ nic nie pobierze");

            // Nazwy muszą być dokładnie jak w słowniku NFZ — wielkimi literami, bez białych
            // znaków na brzegach. Literówka nie daje błędu HTTP, tylko cicho zero wyników.
            benefit.NfzBenefits.Should().OnlyContain(name => name == name.Trim());
            benefit.NfzBenefits.Should().OnlyContain(name => name == name.ToUpperInvariant());
        }
    }

    [Test]
    public void LoadBenefits_SlugsAreUnique()
    {
        BenefitsConfig config = ConfigLoader.LoadBenefits(ConfigDir);

        config.Benefits.Select(b => b.Slug).Should().OnlyHaveUniqueItems();
    }
}
