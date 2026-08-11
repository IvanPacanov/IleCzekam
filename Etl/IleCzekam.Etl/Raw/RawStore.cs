using System.Text;
using System.Text.Json;

namespace IleCzekam.Etl.Raw;

/// <summary>
/// Warstwa raw: odpowiedzi API 1:1, nigdy nie modyfikowane, nigdy nie kasowane.
///
/// Klucz pliku (<paramref name="key"/>) jest ścieżką względną wewnątrz katalogu raw
/// i należy do warstwy wywołującej — ETL NFZ partycjonuje snapshoty po miesiącu
/// pobrania (`snapshots/{YYYY-MM}/...`), więc ponowny fetch w tym samym miesiącu
/// NADPISUJE plik tego miesiąca (idempotentność per miesiąc), a snapshoty
/// z poprzednich miesięcy zostają nietknięte.
///
/// Treść odpowiedzi jest osadzana w polu "response" bajt w bajt (WriteRawValue),
/// metadane pobrania leżą obok niej.
/// </summary>
public sealed class RawStore
{
    private readonly string _rawDir;

    public RawStore(string rawDir)
    {
        _rawDir = rawDir;
    }

    public string FilePath(string key) => Path.Combine(_rawDir, key);

    public void Save(
        string key,
        string endpoint,
        string queryString,
        int httpStatus,
        string responseBody,
        DateTimeOffset fetchedAt
    )
    {
        string path = FilePath(key);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);

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

        File.WriteAllBytes(path, stream.ToArray());
    }

    /// <summary>Czyta wszystkie pliki raw spod <paramref name="relativeDir"/>, posortowane po nazwie.</summary>
    public IEnumerable<RawFile> ReadAll(string relativeDir)
    {
        string dir = Path.Combine(_rawDir, relativeDir);
        if (!Directory.Exists(dir))
        {
            yield break;
        }

        foreach (string path in Directory.EnumerateFiles(dir, "*.json", SearchOption.AllDirectories)
                     .OrderBy(p => p, StringComparer.Ordinal))
        {
            using JsonDocument doc = JsonDocument.Parse(File.ReadAllText(path, Encoding.UTF8));
            JsonElement root = doc.RootElement;

            yield return new RawFile(
                Path.GetRelativePath(dir, path),
                DateTimeOffset.Parse(root.GetProperty("fetched_at").GetString()!),
                root.GetProperty("http_status").GetInt32(),
                root.GetProperty("response").Clone()
            );
        }
    }
}

public sealed record RawFile(string RelativePath, DateTimeOffset FetchedAt, int HttpStatus, JsonElement Response);
