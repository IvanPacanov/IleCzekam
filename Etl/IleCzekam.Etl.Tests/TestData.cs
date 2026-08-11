using IleCzekam.Etl.Configuration;
using IleCzekam.Etl.Transform;

namespace IleCzekam.Etl.Tests;

/// <summary>
/// Fikstury: małe, ręcznie budowane rekordy odwzorowujące kształt odpowiedzi NFZ
/// zaobserwowany w fazie A. Żaden test nie dotyka prawdziwego API.
/// </summary>
public static class TestData
{
    public static EtlSettings Settings() => new()
    {
        WaitBuckets = new WaitBucketsSettings
        {
            KrotkoMaxDays = 29,
            UmiarkowanieMaxDays = 90,
            DlugoMaxDays = 180,
        },
        Validation = new ValidationSettings
        {
            StaleDataMonths = 3,
            MaxPlausibleDays = 1825,
            LowSampleThreshold = 3,
        },
    };

    public static BenefitConfig Benefit() => new()
    {
        Slug = "kardiologia",
        Label = "Kardiologia - oddział szpitalny",
        NfzBenefits = ["ODDZIAŁ KARDIOLOGICZNY"],
        Synonyms = ["serce"],
    };

    public static QueueRecord Record(
        string provider = "SZPITAL A",
        string providerCode = "126/000001",
        string place = "ODDZIAŁ KARDIOLOGII",
        string address = "UL. TESTOWA 1",
        string locality = "GLIWICE",
        string teryt = "2466011",
        string? pcus = "1 mies.",
        bool applicable = true,
        string? asAt = "2026-08-07",
        string? statsMonth = "2026-07",
        int? awaiting = 10,
        int? removed = 2,
        int? averagePeriod = 30,
        int @case = 1
    ) => new(
        Id: Guid.NewGuid().ToString(),
        Case: @case,
        Benefit: "ODDZIAŁ KARDIOLOGICZNY",
        Provider: provider,
        ProviderCode: providerCode,
        Place: place,
        Address: address,
        Locality: locality,
        Phone: "+48 32 000 00 00",
        TerytPlace: teryt,
        Latitude: null,
        Longitude: null,
        ForChildren: false,
        Awaiting: awaiting,
        Removed: removed,
        AveragePeriodDays: averagePeriod,
        StatsMonth: statsMonth,
        PcusRaw: pcus,
        Applicable: applicable,
        AsAt: asAt);

    public static MonthSnapshot Snapshot(string month, params QueueRecord[] records) =>
        new(month, records.Select(r => new SnapshotEntry("12", "kardiologia", r)).ToList());

    /// <summary>Znajduje plik serving dla miasta po slugu.</summary>
    public static ServingFileDto City(this BenefitOutput output, string slug) =>
        output.ServingFiles.Single(f => f.File.Scope.Type == "miasto" && f.File.Scope.Slug == slug).File;

    public static ServingFileDto Province(this BenefitOutput output) =>
        output.ServingFiles.Single(f => f.File.Scope.Type == "wojewodztwo").File;
}
