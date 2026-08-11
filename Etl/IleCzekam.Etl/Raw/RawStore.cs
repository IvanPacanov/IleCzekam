using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace IleCzekam.Etl.Raw;

/// <summary>
/// Metadane jednego pobrania: (miesiąc, województwo, przypadek, świadczenie NFZ).
/// Manifest jest jedynym źródłem prawdy o tym, KTÓRE pliki stron należą do danego
/// snapshotu — dzięki niemu ponowny fetch w tym samym miesiącu może nadpisać snapshot
/// (idempotentność per miesiąc) BEZ kasowania czegokolwiek z raw: gdyby kolejne pobranie
/// dało mniej stron, osierocone pliki po prostu nie są wymienione w manifeście.
/// </summary>
public sealed record SnapshotManifest(
    [property: JsonPropertyName("month")] string Month,
    [property: JsonPropertyName("province")] string Province,
    [property: JsonPropertyName("case")] int Case,
    [property: JsonPropertyName("benefit_slug")] string BenefitSlug,
    [property: JsonPropertyName("nfz_benefit")] string NfzBenefit,
    [property: JsonPropertyName("fetched_at")] DateTimeOffset FetchedAt,
    [property: JsonPropertyName("reported_count")] int ReportedCount,
    [property: JsonPropertyName("pages")] IReadOnlyList<string> Pages
);

/// <summary>
/// Warstwa raw: odpowiedzi API 1:1, nigdy nie modyfikowane, nigdy nie kasowane.
///
/// Układ: {raw}/snapshots/{YYYY-MM}/{province}/case-{case}/{benefit-slug}/page-NNN.json
/// plus `_manifest.json` w tym samym katalogu. Partycjonowanie po MIESIĄCU POBRANIA jest
/// tym, co w ogóle tworzy historię — API NFZ pokazuje wyłącznie stan bieżący.
/// </summary>
public sealed class RawStore
{
    private const string ManifestFileName = "_manifest.json";

    private static readonly JsonSerializerOptions ManifestJson = new()
    {
        WriteIndented = true,
        Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private static readonly UTF8Encoding Utf8NoBom = new(encoderShouldEmitUTF8Identifier: false);

    private readonly string _rawDir;

    public RawStore(string rawDir)
    {
        _rawDir = rawDir;
    }

    public string SnapshotsDir => Path.Combine(_rawDir, "snapshots");

    public string QueueDir(string month, string province, int @case, string nfzBenefitSlug) =>
        Path.Combine(SnapshotsDir, month, province, $"case-{@case}", nfzBenefitSlug);

    public static string PageFileName(int page) => $"page-{page:D3}.json";

    /// <summary>Zapisuje jedną odpowiedź API 1:1 wraz z metadanymi pobrania.</summary>
    public void SavePage(
        string directory,
        int page,
        string endpoint,
        string queryString,
        int httpStatus,
        string responseBody,
        DateTimeOffset fetchedAt
    )
    {
        Directory.CreateDirectory(directory);

        using MemoryStream stream = new();
        using (Utf8JsonWriter writer = new(stream, new JsonWriterOptions { Indented = true }))
        {
            writer.WriteStartObject();
            writer.WriteString("endpoint", endpoint);
            writer.WriteString("query", queryString);
            writer.WriteString("fetched_at", fetchedAt.ToString("O"));
            writer.WriteNumber("http_status", httpStatus);
            writer.WritePropertyName("response");
            writer.WriteRawValue(responseBody, skipInputValidation: false);
            writer.WriteEndObject();
        }

        File.WriteAllBytes(Path.Combine(directory, PageFileName(page)), stream.ToArray());
    }

    public void SaveManifest(string directory, SnapshotManifest manifest)
    {
        Directory.CreateDirectory(directory);
        File.WriteAllText(Path.Combine(directory, ManifestFileName), JsonSerializer.Serialize(manifest, ManifestJson), Utf8NoBom);
    }

    /// <summary>Miesiące, dla których istnieje choć jeden snapshot, rosnąco (YYYY-MM).</summary>
    public IReadOnlyList<string> Months() =>
        !Directory.Exists(SnapshotsDir)
            ? []
            : Directory.EnumerateDirectories(SnapshotsDir)
                .Select(Path.GetFileName)
                .OfType<string>()
                .Where(name => name.Length == 7 && name[4] == '-')
                .OrderBy(name => name, StringComparer.Ordinal)
                .ToList();

    /// <summary>Wszystkie manifesty danego miesiąca.</summary>
    public IEnumerable<(SnapshotManifest Manifest, string Directory)> ReadManifests(string month)
    {
        string monthDir = Path.Combine(SnapshotsDir, month);
        if (!Directory.Exists(monthDir))
        {
            yield break;
        }

        foreach (string path in Directory.EnumerateFiles(monthDir, ManifestFileName, SearchOption.AllDirectories)
                     .OrderBy(p => p, StringComparer.Ordinal))
        {
            SnapshotManifest? manifest = JsonSerializer.Deserialize<SnapshotManifest>(File.ReadAllText(path, Encoding.UTF8));
            if (manifest is not null)
            {
                yield return (manifest, Path.GetDirectoryName(path)!);
            }
        }
    }

    /// <summary>Treść odpowiedzi API (pole `response`) ze strony wymienionej w manifeście.</summary>
    public JsonDocument ReadPage(string directory, string pageFileName)
    {
        using JsonDocument file = JsonDocument.Parse(File.ReadAllText(Path.Combine(directory, pageFileName), Encoding.UTF8));
        return JsonDocument.Parse(file.RootElement.GetProperty("response").GetRawText());
    }
}
