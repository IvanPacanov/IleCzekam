using System.Text.Json;
using IleCzekam.Etl.Common;
using IleCzekam.Etl.Configuration;
using IleCzekam.Etl.Raw;

namespace IleCzekam.Etl.Fetch;

/// <summary>
/// Pobiera kolejki z API NFZ do warstwy raw, partycjonowanej po miesiącu pobrania.
///
/// Pobieramy oba przypadki medyczne (1 stabilny, 2 pilny) — to ta sama placówka widziana
/// z dwóch stron i pacjent potrzebuje obu liczb.
/// </summary>
public sealed class FetchCommand
{
    private readonly INfzHttp _http;
    private readonly RawStore _raw;
    private readonly EtlSettings _settings;

    private static readonly int[] Cases = [1, 2];

    public FetchCommand(INfzHttp http, RawStore raw, EtlSettings settings)
    {
        _http = http;
        _raw = raw;
        _settings = settings;
    }

    public async Task<int> RunAsync(
        IReadOnlyList<BenefitConfig> benefits,
        IReadOnlyList<string> provinces,
        DateTimeOffset now,
        CancellationToken cancellationToken
    )
    {
        string month = now.ToString("yyyy-MM");
        Console.WriteLine($"Snapshot {month}: {benefits.Count} świadczeń × {provinces.Count} województw × {Cases.Length} przypadki");

        await VerifyBenefitNamesAsync(benefits, cancellationToken);

        int pagesFetched = 0;
        int recordsFetched = 0;
        List<string> emptyEverywhere = [];

        foreach (BenefitConfig benefit in benefits)
        {
            foreach (string nfzBenefit in benefit.NfzBenefits)
            {
                int totalForName = 0;

                foreach (string province in provinces)
                {
                    foreach (int @case in Cases)
                    {
                        (int pages, int records) = await FetchOneAsync(
                            benefit, nfzBenefit, province, @case, month, now, cancellationToken);

                        pagesFetched += pages;
                        recordsFetched += records;
                        totalForName += records;
                    }
                }

                if (totalForName == 0)
                {
                    emptyEverywhere.Add(nfzBenefit);
                }
            }
        }

        Console.WriteLine($"\nPobrano {pagesFetched} stron, {recordsFetched} rekordów -> {_raw.SnapshotsDir}/{month}");

        if (emptyEverywhere.Count > 0)
        {
            Console.WriteLine(
                "\nUwaga: świadczenia bez ani jednej kolejki w żadnym z pobranych województw "
                + $"(sprawdź, czy nazwa jest aktualna): {string.Join("; ", emptyEverywhere)}");
        }

        return 0;
    }

    /// <summary>
    /// Sprawdza, czy nazwy świadczeń z configu istnieją w słowniku NFZ.
    ///
    /// API na nieistniejącą nazwę odpowiada HTTP 200 i `count: 0` — literówka jest CICHA
    /// i wyglądałaby jak „brak kolejek”. Weryfikacja słownikowa zamienia to w twardy błąd.
    /// </summary>
    private async Task VerifyBenefitNamesAsync(IReadOnlyList<BenefitConfig> benefits, CancellationToken cancellationToken)
    {
        List<string> unknown = [];

        foreach (string name in benefits.SelectMany(b => b.NfzBenefits).Distinct())
        {
            NfzResponse response = await _http.GetAsync(
                "benefits",
                [
                    new("name", name),
                    new("page", "1"),
                    new("limit", _settings.Api.PageLimit.ToString()),
                    new("format", "json"),
                ],
                cancellationToken);

            if (response.StatusCode != 200)
            {
                throw new EtlException($"Słownik świadczeń zwrócił HTTP {response.StatusCode} dla '{name}'.");
            }

            using JsonDocument document = JsonDocument.Parse(response.Body);
            bool found = document.RootElement.TryGetProperty("data", out JsonElement data)
                         && data.ValueKind == JsonValueKind.Array
                         && data.EnumerateArray().Any(item => item.GetString() == name);

            if (!found)
            {
                unknown.Add(name);
            }
        }

        if (unknown.Count > 0)
        {
            throw new EtlException(
                "Nazwy świadczeń nieobecne w słowniku NFZ (/benefits) — zapytanie o kolejki zwróciłoby "
                + $"po cichu 0 wyników:{Environment.NewLine}  - {string.Join($"{Environment.NewLine}  - ", unknown)}");
        }

        Console.WriteLine($"Słownik NFZ: zweryfikowano {benefits.SelectMany(b => b.NfzBenefits).Distinct().Count()} nazw świadczeń.");
    }

    private async Task<(int Pages, int Records)> FetchOneAsync(
        BenefitConfig benefit,
        string nfzBenefit,
        string province,
        int @case,
        string month,
        DateTimeOffset now,
        CancellationToken cancellationToken
    )
    {
        string directory = _raw.QueueDir(month, province, @case, Slug.From(nfzBenefit));
        List<string> pages = [];
        int records = 0;
        int reportedCount = 0;

        for (int page = 1; ; page++)
        {
            List<KeyValuePair<string, string>> query =
            [
                new("case", @case.ToString()),
                new("province", province),
                new("benefit", nfzBenefit),
                new("page", page.ToString()),
                new("limit", _settings.Api.PageLimit.ToString()),
                new("format", "json"),
            ];

            NfzResponse response = await _http.GetAsync("queues", query, cancellationToken);

            if (response.StatusCode != 200)
            {
                throw new EtlException(
                    $"HTTP {response.StatusCode} dla '{nfzBenefit}' (woj. {province}, przypadek {@case}, strona {page}): {Truncate(response.Body)}");
            }

            using JsonDocument document = JsonDocument.Parse(response.Body);
            JsonElement root = document.RootElement;

            int pageRecords = root.TryGetProperty("data", out JsonElement data) && data.ValueKind == JsonValueKind.Array
                ? data.GetArrayLength()
                : 0;

            if (page == 1)
            {
                reportedCount = root.GetProperty("meta").GetProperty("count").GetInt32();
                if (reportedCount == 0)
                {
                    return (0, 0);
                }

                Console.WriteLine($"  {nfzBenefit} | woj. {province} | przypadek {@case}: {reportedCount} kolejek");
            }

            _raw.SavePage(directory, page, "queues", DescribeQuery(query), response.StatusCode, response.Body, now);
            pages.Add(RawStore.PageFileName(page));
            records += pageRecords;

            bool hasNext = root.TryGetProperty("links", out JsonElement links)
                           && links.TryGetProperty("next", out JsonElement next)
                           && next.ValueKind == JsonValueKind.String;

            if (!hasNext)
            {
                break;
            }
        }

        _raw.SaveManifest(directory, new SnapshotManifest(
            month, province, @case, benefit.Slug, nfzBenefit, now, reportedCount, pages));

        return (pages.Count, records);
    }

    private static string DescribeQuery(IEnumerable<KeyValuePair<string, string>> query) =>
        string.Join('&', query.Select(p => $"{p.Key}={p.Value}"));

    private static string Truncate(string text) => text.Length <= 300 ? text : text[..300] + "…";
}
