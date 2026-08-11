using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using IleCzekam.Etl.Configuration;
using IleCzekam.Etl.Raw;

namespace IleCzekam.Etl.Transform;

/// <summary>
/// Czyta wyłącznie raw + config, pisze processed i serving. Zero sieci, deterministyczny.
/// Katalogi processed i serving są nadpisywane w całości; raw pozostaje nietknięty.
/// </summary>
public sealed class TransformCommand
{
    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>Pliki JSON bez BOM - BOM psuje parsery po stronie frontendu i narzędzi CLI.</summary>
    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    private readonly RawStore _raw;
    private readonly EtlSettings _settings;
    private readonly BenefitsConfig _benefits;

    public TransformCommand(RawStore raw, EtlSettings settings, BenefitsConfig benefits)
    {
        _raw = raw;
        _settings = settings;
        _benefits = benefits;
    }

    public int Run(DateTimeOffset generatedAt)
    {
        IReadOnlyList<string> months = _raw.Months();
        if (months.Count == 0)
        {
            throw new EtlException($"Brak snapshotów w {_raw.SnapshotsDir}. Uruchom najpierw `make fetch`.");
        }

        Console.WriteLine($"Snapshoty: {string.Join(", ", months)}");

        Dictionary<string, List<MonthSnapshot>> byBenefit = LoadSnapshots(months);
        Transformer transformer = new(_settings);

        PrepareOutputDirectory(_settings.Paths.Processed);
        PrepareOutputDirectory(_settings.Paths.Serving);

        List<SearchIndexEntryDto> searchIndex = [];
        List<FactRow> facts = [];
        List<(string Slug, ValidationReport Report)> reports = [];
        int filesWritten = 0;

        foreach (BenefitConfig benefit in _benefits.Benefits)
        {
            if (!byBenefit.TryGetValue(benefit.Slug, out List<MonthSnapshot>? snapshots))
            {
                Console.WriteLine($"Pomijam '{benefit.Slug}' - brak danych w snapshotach.");
                continue;
            }

            BenefitOutput output = transformer.Build(benefit, snapshots, generatedAt);

            foreach ((string relativePath, ServingFileDto file) in output.ServingFiles)
            {
                Write(Path.Combine(_settings.Paths.Serving, relativePath), file);
                filesWritten++;
            }

            foreach ((string relativePath, ProcessedFileDto file) in output.ProcessedFiles)
            {
                Write(Path.Combine(_settings.Paths.Processed, relativePath), file);
                filesWritten++;
            }

            searchIndex.AddRange(output.SearchEntries);
            facts.AddRange(output.Facts);
            reports.Add((benefit.Slug, output.Report));
        }

        Write(Path.Combine(_settings.Paths.Serving, "search-index", "index.json"), searchIndex);
        filesWritten++;

        WriteFacts(FactsPath(_settings), facts);
        filesWritten++;

        PrintReport(reports, filesWritten);
        return 0;
    }

    private Dictionary<string, List<MonthSnapshot>> LoadSnapshots(IReadOnlyList<string> months)
    {
        Dictionary<string, List<MonthSnapshot>> byBenefit = [];

        foreach (string month in months)
        {
            Dictionary<string, List<SnapshotEntry>> entriesByBenefit = [];

            foreach ((SnapshotManifest manifest, string directory) in _raw.ReadManifests(month))
            {
                if (!entriesByBenefit.TryGetValue(manifest.BenefitSlug, out List<SnapshotEntry>? entries))
                {
                    entriesByBenefit[manifest.BenefitSlug] = entries = [];
                }

                foreach (string page in manifest.Pages)
                {
                    using JsonDocument response = _raw.ReadPage(directory, page);

                    if (!response.RootElement.TryGetProperty("data", out JsonElement data)
                        || data.ValueKind != JsonValueKind.Array)
                    {
                        continue;
                    }

                    foreach (JsonElement item in data.EnumerateArray())
                    {
                        entries.Add(new SnapshotEntry(manifest.Province, manifest.BenefitSlug, QueueRecord.FromApi(item)));
                    }
                }
            }

            foreach ((string slug, List<SnapshotEntry> entries) in entriesByBenefit)
            {
                if (!byBenefit.TryGetValue(slug, out List<MonthSnapshot>? snapshots))
                {
                    byBenefit[slug] = snapshots = [];
                }

                snapshots.Add(new MonthSnapshot(month, entries));
            }
        }

        return byBenefit;
    }

    /// <summary>Nadpisanie w całości - processed i serving są w pełni odtwarzalne z raw.</summary>
    private static void PrepareOutputDirectory(string path)
    {
        if (Directory.Exists(path))
        {
            Directory.Delete(path, recursive: true);
        }

        Directory.CreateDirectory(path);
    }

    public static string FactsPath(EtlSettings settings) => Path.Combine(settings.Paths.Processed, "facts.jsonl");

    /// <summary>
    /// Tabela faktów w JSON Lines - jeden wiersz na linię, bez tablicy opakowującej.
    /// Format wybrany celowo: ładuje się strumieniowo i czyta go każde narzędzie
    /// analityczne bez kroku parsowania całego pliku do pamięci.
    /// </summary>
    private static void WriteFacts(string path, IReadOnlyList<FactRow> facts)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

        using StreamWriter writer = new(path, append: false, Utf8NoBom);
        foreach (FactRow fact in facts)
        {
            writer.WriteLine(JsonSerializer.Serialize(fact, FactJson));
        }
    }

    private static readonly JsonSerializerOptions FactJson = new()
    {
        WriteIndented = false,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private static void Write<T>(string path, T value)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(value, Json), Utf8NoBom);
    }

    private void PrintReport(IReadOnlyList<(string Slug, ValidationReport Report)> reports, int filesWritten)
    {
        Console.WriteLine();
        Console.WriteLine("=== RAPORT WALIDACJI ===");

        foreach ((string slug, ValidationReport report) in reports)
        {
            Console.WriteLine($"\n{slug}:");
            Console.WriteLine($"  placówek razem:            {report.PlacesTotal}");
            Console.WriteLine($"  bez żadnej flagi:          {report.PlacesOk}");
            Console.WriteLine($"  duplikatów scalonych:      {report.DuplicatesMerged}");

            foreach (string flag in new[]
            {
                ValidationFlag.NoData,
                ValidationFlag.NotApplicable,
                ValidationFlag.SuspiciousValue,
                ValidationFlag.StaleData,
            })
            {
                Console.WriteLine($"  {flag,-25} {report.FlagCounts.GetValueOrDefault(flag)}");
            }

            foreach (string note in report.Notes)
            {
                Console.WriteLine($"  ! {note}");
            }
        }

        Console.WriteLine($"\nZapisano {filesWritten} plików: {_settings.Paths.Processed}, {_settings.Paths.Serving}");
        Console.WriteLine("Źródło danych: https://api.nfz.gov.pl/ (Narodowy Fundusz Zdrowia)");
    }
}
