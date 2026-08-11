using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using IleCzekam.Etl.Common;
using IleCzekam.Etl.Configuration;

namespace IleCzekam.Etl.Transform;

/// <summary>Rekord kolejki wraz z kontekstem, który przychodzi z manifestu snapshotu.</summary>
public sealed record SnapshotEntry(string Province, string BenefitSlug, QueueRecord Record);

/// <summary>Jeden miesięczny snapshot — podstawa trendu.</summary>
public sealed record MonthSnapshot(string Month, IReadOnlyList<SnapshotEntry> Entries);

/// <summary>Placówka po scaleniu przypadku stabilnego i pilnego.</summary>
public sealed record MergedPlace(
    string Id,
    string Province,
    QueueRecord Stable,
    QueueRecord? Urgent
);

/// <summary>Liczby do raportu walidacji na stdout.</summary>
public sealed class ValidationReport
{
    public int PlacesTotal { get; set; }
    public int PlacesOk { get; set; }
    public int DuplicatesMerged { get; set; }
    public Dictionary<string, int> FlagCounts { get; } = [];
    public List<string> Notes { get; } = [];

    public void Flag(string flag) => FlagCounts[flag] = FlagCounts.GetValueOrDefault(flag) + 1;
}

/// <summary>
/// Warstwa processed: pełny wynik transformacji i walidacji dla (świadczenie, województwo,
/// miesiąc) — wszystkie placówki z kompletem flag, także te wykluczone z agregatów.
/// </summary>
public sealed record ProcessedFileDto(
    [property: System.Text.Json.Serialization.JsonPropertyName("benefit_slug")] string BenefitSlug,
    [property: System.Text.Json.Serialization.JsonPropertyName("province")] string Province,
    [property: System.Text.Json.Serialization.JsonPropertyName("month")] string Month,
    [property: System.Text.Json.Serialization.JsonPropertyName("places")] IReadOnlyList<PlaceDto> Places
);

/// <summary>Wynik transformacji jednego świadczenia — pliki do zapisania i raport.</summary>
public sealed record BenefitOutput(
    IReadOnlyList<(string RelativePath, ServingFileDto File)> ServingFiles,
    IReadOnlyList<(string RelativePath, ProcessedFileDto File)> ProcessedFiles,
    IReadOnlyList<SearchIndexEntryDto> SearchEntries,
    IReadOnlyList<FactRow> Facts,
    ValidationReport Report
);

/// <summary>
/// Cała logika transformacji — czysta funkcja ze snapshotów na pliki serving.
/// Bez IO i bez sieci, żeby dała się przetestować na fiksturach.
/// </summary>
public sealed class Transformer
{
    private readonly EtlSettings _settings;

    public Transformer(EtlSettings settings)
    {
        _settings = settings;
    }

    public BenefitOutput Build(BenefitConfig benefit, IReadOnlyList<MonthSnapshot> months, DateTimeOffset generatedAt)
    {
        if (months.Count == 0)
        {
            throw new EtlException($"Brak snapshotów dla świadczenia '{benefit.Slug}'.");
        }

        ValidationReport report = new();
        MonthSnapshot latest = months[^1];

        IReadOnlyList<MergedPlace> places = MergePlaces(latest.Entries, report);
        report.PlacesTotal = places.Count;

        Dictionary<string, IReadOnlyList<string>> flagsByPlace = places.ToDictionary(
            p => p.Id,
            p => PlaceFlags(p, latest.Month, report));

        report.PlacesOk = flagsByPlace.Count(f => f.Value.Count == 0);

        // Trend liczymy z KAŻDEGO dostępnego snapshotu — historia powstaje u nas,
        // API NFZ zna wyłącznie stan bieżący.
        List<(string Month, IReadOnlyList<MergedPlace> Places)> history = months
            .Select(m => (m.Month, MergePlaces(m.Entries, new ValidationReport())))
            .ToList();

        List<(string RelativePath, ServingFileDto File)> files = [];
        List<SearchIndexEntryDto> searchEntries = [];

        foreach (string province in places.Select(p => p.Province).Distinct().OrderBy(p => p, StringComparer.Ordinal))
        {
            IReadOnlyList<MergedPlace> provincePlaces = places.Where(p => p.Province == province).ToList();
            int? provinceMedian = Median(provincePlaces, flagsByPlace);

            IReadOnlyList<CityAggregate> cities = provincePlaces
                .GroupBy(p => p.Stable.TerytPlace)
                .Select(g => new CityAggregate(
                    Name: g.First().Stable.Locality,
                    Slug: Slug.From(g.First().Stable.Locality),
                    Teryt: g.Key,
                    Places: g.ToList(),
                    MedianDays: Median(g.ToList(), flagsByPlace)))
                .OrderBy(c => c.Name, StringComparer.CurrentCulture)
                .ToList();

            BestCityDto? bestCity = PickBestCity(cities);

            foreach (CityAggregate city in cities)
            {
                files.Add((
                    Path.Combine("swiadczenia", benefit.Slug, $"{city.Slug}.json"),
                    BuildFile(
                        benefit,
                        new ScopeDto("miasto", city.Name, city.Slug, city.Teryt, province),
                        city.Places,
                        flagsByPlace,
                        latest.Month,
                        generatedAt,
                        new ComparisonDto(city.MedianDays, provinceMedian, bestCity),
                        Trend(history, flagsByPlace, p => p.Province == province && p.Stable.TerytPlace == city.Teryt))));

                searchEntries.Add(new SearchIndexEntryDto(
                    benefit.Slug, benefit.Label, benefit.Synonyms,
                    city.Name, city.Slug, province, city.MedianDays, city.Places.Count));
            }

            files.Add((
                Path.Combine("swiadczenia", benefit.Slug, $"wojewodztwo-{province}.json"),
                BuildFile(
                    benefit,
                    new ScopeDto("wojewodztwo", ProvinceName(province), $"wojewodztwo-{province}", null, province),
                    provincePlaces,
                    flagsByPlace,
                    latest.Month,
                    generatedAt,
                    new ComparisonDto(provinceMedian, provinceMedian, bestCity),
                    Trend(history, flagsByPlace, p => p.Province == province))));
        }

        List<(string RelativePath, ProcessedFileDto File)> processed = [];

        foreach ((string month, IReadOnlyList<MergedPlace> monthPlaces) in history)
        {
            foreach (IGrouping<string, MergedPlace> group in monthPlaces.GroupBy(p => p.Province))
            {
                List<PlaceDto> dtos = group
                    .Select(p => ToDto(p, PlaceFlags(p, month, new ValidationReport())))
                    .ToList();

                processed.Add((
                    Path.Combine(benefit.Slug, group.Key, $"{month}.json"),
                    new ProcessedFileDto(benefit.Slug, group.Key, month, dtos)));
            }
        }

        List<FactRow> facts = [];

        foreach ((string month, IReadOnlyList<MergedPlace> monthPlaces) in history)
        {
            foreach (MergedPlace place in monthPlaces)
            {
                facts.Add(Fact(benefit, place, place.Stable, month));

                if (place.Urgent is not null)
                {
                    facts.Add(Fact(benefit, place, place.Urgent, month));
                }
            }
        }

        return new BenefitOutput(files, processed, searchEntries, facts, report);
    }

    private FactRow Fact(BenefitConfig benefit, MergedPlace place, QueueRecord record, string month)
    {
        int? days = Pcus.ToDays(record.PcusRaw);
        IReadOnlyList<string> flags = RecordFlags(record, month);

        return new FactRow(
            Month: month,
            BenefitSlug: benefit.Slug,
            BenefitLabel: benefit.Label,
            NfzBenefit: record.Benefit,
            Province: place.Province,
            ProvinceName: ProvinceName(place.Province),
            City: record.Locality,
            CitySlug: Slug.From(record.Locality),
            Teryt: record.TerytPlace,
            PlaceId: place.Id,
            Provider: record.Provider,
            ProviderCode: record.ProviderCode,
            Place: record.Place,
            Address: record.Address,
            Phone: record.Phone,
            Latitude: record.Latitude,
            Longitude: record.Longitude,
            ForChildren: record.ForChildren,
            Case: record.Case,
            PcusRaw: record.PcusRaw,
            RawDays: days,
            Bucket: Pcus.BucketName(Pcus.ToBucket(days, record.Applicable, _settings.WaitBuckets)),
            Applicable: record.Applicable,
            AsAt: record.AsAt,
            Awaiting: record.Awaiting,
            Removed: record.Removed,
            AveragePeriodDays: record.AveragePeriodDays,
            StatsMonth: record.StatsMonth,
            NoData: flags.Contains(ValidationFlag.NoData),
            NotApplicable: flags.Contains(ValidationFlag.NotApplicable),
            Suspicious: flags.Contains(ValidationFlag.SuspiciousValue),
            Stale: flags.Contains(ValidationFlag.StaleData));
    }

    private sealed record CityAggregate(
        string Name,
        string Slug,
        string Teryt,
        IReadOnlyList<MergedPlace> Places,
        int? MedianDays
    );

    /// <summary>
    /// Scala rekordy w placówki: przypadek stabilny + pilny to ta sama placówka widziana
    /// dwa razy. Przy okazji usuwa realne duplikaty (ta sama komórka wykazana wielokrotnie) —
    /// wygrywa rekord z nowszą datą aktualności prognozy.
    /// </summary>
    private static IReadOnlyList<MergedPlace> MergePlaces(IReadOnlyList<SnapshotEntry> entries, ValidationReport report)
    {
        Dictionary<(string Province, (string, string, string, string) Key), List<SnapshotEntry>> grouped = [];

        foreach (SnapshotEntry entry in entries)
        {
            (string, (string, string, string, string)) key = (entry.Province, entry.Record.BusinessKey);
            if (!grouped.TryGetValue(key, out List<SnapshotEntry>? bucket))
            {
                grouped[key] = bucket = [];
            }

            bucket.Add(entry);
        }

        List<MergedPlace> places = [];

        foreach ((var key, List<SnapshotEntry> bucket) in grouped)
        {
            List<QueueRecord> stable = bucket.Where(e => e.Record.Case == 1).Select(e => e.Record).ToList();
            List<QueueRecord> urgent = bucket.Where(e => e.Record.Case == 2).Select(e => e.Record).ToList();

            report.DuplicatesMerged += Math.Max(0, stable.Count - 1) + Math.Max(0, urgent.Count - 1);

            QueueRecord? stablePick = Newest(stable);
            QueueRecord? urgentPick = Newest(urgent);

            // Placówka wykazana wyłącznie w przypadku pilnym nadal jest placówką —
            // pokazujemy ją, tylko bez prognozy dla przypadku stabilnego.
            QueueRecord primary = stablePick ?? urgentPick!;

            places.Add(new MergedPlace(
                Id: PlaceId(primary),
                Province: key.Item1,
                Stable: stablePick ?? primary with { PcusRaw = null, AsAt = null, Case = 1 },
                Urgent: urgentPick));
        }

        return places
            .OrderBy(p => p.Stable.Locality, StringComparer.CurrentCulture)
            .ThenBy(p => p.Stable.Provider, StringComparer.CurrentCulture)
            .ToList();
    }

    private static QueueRecord? Newest(List<QueueRecord> records) =>
        records.Count <= 1
            ? records.FirstOrDefault()
            : records.OrderByDescending(r => r.AsAt ?? string.Empty, StringComparer.Ordinal).First();

    /// <summary>Stabilny identyfikator placówki — ten sam w każdym miesięcznym snapshocie.</summary>
    private static string PlaceId(QueueRecord record)
    {
        (string benefit, string providerCode, string place, string address) = record.BusinessKey;
        byte[] hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{benefit}|{providerCode}|{place}|{address}"));
        return $"{Slug.From(providerCode)}-{Convert.ToHexString(hash)[..8].ToLowerInvariant()}";
    }

    private IReadOnlyList<string> PlaceFlags(MergedPlace place, string snapshotMonth, ValidationReport report)
    {
        IReadOnlyList<string> flags = RecordFlags(place.Stable, snapshotMonth);

        foreach (string flag in flags)
        {
            report.Flag(flag);
        }

        return flags;
    }

    /// <summary>Flagi walidacji dla pojedynczego rekordu (osobno dla przypadku stabilnego i pilnego).</summary>
    private IReadOnlyList<string> RecordFlags(QueueRecord record, string snapshotMonth)
    {
        List<string> flags = [];

        int? days = Pcus.ToDays(record.PcusRaw);

        if (!record.Applicable)
        {
            flags.Add(ValidationFlag.NotApplicable);
        }
        else if (days is null)
        {
            flags.Add(ValidationFlag.NoData);
        }
        else if (days < 0 || days > _settings.Validation.MaxPlausibleDays)
        {
            flags.Add(ValidationFlag.SuspiciousValue);
        }

        if (IsStale(record.StatsMonth, snapshotMonth))
        {
            flags.Add(ValidationFlag.StaleData);
        }

        return flags;
    }

    /// <summary>
    /// „Nieświeżość” mierzymy miesiącem statystyk placówki (`provider-data.update`),
    /// nie datą prognozy — patrz RECON.md, rozbieżność R5.
    /// </summary>
    private bool IsStale(string? statsMonth, string snapshotMonth)
    {
        if (statsMonth is null
            || !DateTime.TryParseExact(statsMonth, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime stats)
            || !DateTime.TryParseExact(snapshotMonth, "yyyy-MM", CultureInfo.InvariantCulture, DateTimeStyles.None, out DateTime snapshot))
        {
            return false;
        }

        int monthsBehind = ((snapshot.Year - stats.Year) * 12) + snapshot.Month - stats.Month;
        return monthsBehind > _settings.Validation.StaleDataMonths;
    }

    /// <summary>
    /// Mediana z dni oczekiwania. Wartości podejrzane i braki NIE wchodzą do agregatu —
    /// brak danych nigdy nie może zostać policzony jako zero.
    /// </summary>
    private static int? Median(IReadOnlyList<MergedPlace> places, IReadOnlyDictionary<string, IReadOnlyList<string>> flags)
    {
        List<int> values = places
            .Where(p => !(flags.TryGetValue(p.Id, out IReadOnlyList<string>? f) && f.Contains(ValidationFlag.SuspiciousValue)))
            .Select(p => Pcus.ToDays(p.Stable.PcusRaw))
            .OfType<int>()
            .OrderBy(v => v)
            .ToList();

        if (values.Count == 0)
        {
            return null;
        }

        int middle = values.Count / 2;
        return values.Count % 2 == 1
            ? values[middle]
            : (int)Math.Round((values[middle - 1] + values[middle]) / 2.0, MidpointRounding.AwayFromZero);
    }

    private BestCityDto? PickBestCity(IReadOnlyList<CityAggregate> cities)
    {
        List<CityAggregate> withData = cities.Where(c => c.MedianDays is not null).ToList();
        if (withData.Count == 0)
        {
            return null;
        }

        // Preferujemy miasto z próbą na tyle dużą, żeby mediana coś znaczyła; jeśli takiego
        // nie ma, bierzemy najlepsze z małych i mówimy o tym wprost flagą low_sample.
        List<CityAggregate> reliable = withData
            .Where(c => CountWithData(c.Places) >= _settings.Validation.LowSampleThreshold)
            .ToList();

        CityAggregate best = (reliable.Count > 0 ? reliable : withData)
            .OrderBy(c => c.MedianDays!.Value)
            .ThenBy(c => c.Name, StringComparer.CurrentCulture)
            .First();

        return new BestCityDto(
            best.Name,
            best.Slug,
            best.MedianDays!.Value,
            Pcus.DaysToHumanLabel(best.MedianDays),
            LowSample: CountWithData(best.Places) < _settings.Validation.LowSampleThreshold);
    }

    private static int CountWithData(IReadOnlyList<MergedPlace> places) =>
        places.Count(p => Pcus.ToDays(p.Stable.PcusRaw) is not null);

    private IReadOnlyList<TrendPointDto> Trend(
        IReadOnlyList<(string Month, IReadOnlyList<MergedPlace> Places)> history,
        IReadOnlyDictionary<string, IReadOnlyList<string>> latestFlags,
        Func<MergedPlace, bool> scope
    )
    {
        List<TrendPointDto> points = [];

        foreach ((string month, IReadOnlyList<MergedPlace> monthPlaces) in history)
        {
            List<MergedPlace> inScope = monthPlaces.Where(scope).ToList();

            // Flagi liczymy dla historycznych placówek od nowa — placówka mogła nie istnieć
            // w poprzednim miesiącu albo mieć wtedy inną wartość.
            Dictionary<string, IReadOnlyList<string>> flags = inScope.ToDictionary(
                p => p.Id,
                p => latestFlags.TryGetValue(p.Id, out IReadOnlyList<string>? f) ? f : PlaceFlags(p, month, new ValidationReport()));

            points.Add(new TrendPointDto(month, Median(inScope, flags), CountWithData(inScope)));
        }

        return points;
    }

    private ServingFileDto BuildFile(
        BenefitConfig benefit,
        ScopeDto scope,
        IReadOnlyList<MergedPlace> places,
        IReadOnlyDictionary<string, IReadOnlyList<string>> flags,
        string snapshotMonth,
        DateTimeOffset generatedAt,
        ComparisonDto comparison,
        IReadOnlyList<TrendPointDto> trend
    )
    {
        int withData = CountWithData(places);
        int? median = Median(places, flags);

        List<string> summaryFlags = [];
        if (withData < _settings.Validation.LowSampleThreshold)
        {
            summaryFlags.Add(ValidationFlag.LowSample);
        }

        MergedPlace? fastest = places
            .Where(p => Pcus.ToDays(p.Stable.PcusRaw) is not null
                        && !(flags.TryGetValue(p.Id, out IReadOnlyList<string>? f) && f.Contains(ValidationFlag.SuspiciousValue)))
            .OrderBy(p => Pcus.ToDays(p.Stable.PcusRaw)!.Value)
            .FirstOrDefault();

        return new ServingFileDto(
            Benefit: new BenefitDto(benefit.Slug, benefit.Label, benefit.NfzBenefits),
            Scope: scope,
            SnapshotMonth: snapshotMonth,
            GeneratedAt: generatedAt.ToString("O"),
            Source: SourceDto.Nfz,
            Summary: new SummaryDto(
                median,
                Pcus.DaysToHumanLabel(median),
                Pcus.BucketName(Pcus.ToBucket(median, applicable: true, _settings.WaitBuckets)),
                fastest is null
                    ? null
                    : new FastestDto(
                        fastest.Id,
                        fastest.Stable.Provider,
                        fastest.Stable.Locality,
                        Pcus.ToDays(fastest.Stable.PcusRaw)!.Value,
                        Pcus.ToHumanLabel(fastest.Stable.PcusRaw)),
                places.Count,
                withData,
                places.Count - withData,
                summaryFlags),
            Comparison: comparison,
            Trend: trend,
            Places: places.Select(p => ToDto(p, flags.TryGetValue(p.Id, out IReadOnlyList<string>? f) ? f : [])).ToList());
    }

    private PlaceDto ToDto(MergedPlace place, IReadOnlyList<string> flags)
    {
        QueueRecord stable = place.Stable;

        return new PlaceDto(
            place.Id,
            stable.Provider,
            stable.Place,
            stable.Address,
            stable.Locality,
            stable.TerytPlace,
            stable.Phone,
            stable.Latitude,
            stable.Longitude,
            stable.ForChildren,
            stable.Benefit,
            ToWaitDto(stable),
            place.Urgent is null ? null : ToWaitDto(place.Urgent),
            stable.Awaiting,
            stable.AveragePeriodDays,
            stable.StatsMonth,
            flags);
    }

    private WaitDto ToWaitDto(QueueRecord record)
    {
        int? days = Pcus.ToDays(record.PcusRaw);

        return new WaitDto(
            record.PcusRaw,
            days,
            record.Applicable ? Pcus.ToHumanLabel(record.PcusRaw) : "nie dotyczy",
            Pcus.BucketName(Pcus.ToBucket(days, record.Applicable, _settings.WaitBuckets)),
            record.AsAt);
    }

    private static string ProvinceName(string code) => code switch
    {
        "01" => "dolnośląskie", "02" => "kujawsko-pomorskie", "03" => "lubelskie", "04" => "lubuskie",
        "05" => "łódzkie", "06" => "małopolskie", "07" => "mazowieckie", "08" => "opolskie",
        "09" => "podkarpackie", "10" => "podlaskie", "11" => "pomorskie", "12" => "śląskie",
        "13" => "świętokrzyskie", "14" => "warmińsko-mazurskie", "15" => "wielkopolskie",
        "16" => "zachodniopomorskie",
        _ => code,
    };
}
