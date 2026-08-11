using System.Text.Json;

namespace IleCzekam.Etl.Transform;

/// <summary>
/// Jeden rekord kolejki z API NFZ, sprowadzony do pól, których używa serwis.
/// Odwzorowanie 1:1 nazw z API jest w <see cref="FromApi"/> — reszta pipeline'u
/// nie zna już myślnikowych nazw pól NFZ.
/// </summary>
public sealed record QueueRecord(
    string Id,
    int Case,
    string Benefit,
    string Provider,
    string ProviderCode,
    string Place,
    string Address,
    string Locality,
    string? Phone,
    string TerytPlace,
    double? Latitude,
    double? Longitude,
    bool ForChildren,
    int? Awaiting,
    int? Removed,
    int? AveragePeriodDays,
    string? StatsMonth,
    string? PcusRaw,
    bool Applicable,
    string? AsAt
)
{
    /// <summary>
    /// Klucz biznesowy placówki. `id` z API jest unikalne w KAŻDYM rekordzie (8 478/8 478
    /// w snapshocie rozpoznania), więc deduplikacja po nim nigdy nic nie usuwa — realne
    /// duplikaty widać dopiero po tej czwórce. Patrz RECON.md, rozbieżność R6.
    /// </summary>
    public (string, string, string, string) BusinessKey => (Benefit, ProviderCode, Place, Address);

    public static QueueRecord FromApi(JsonElement item)
    {
        JsonElement a = item.GetProperty("attributes");

        JsonElement dates = a.GetProperty("dates");
        bool datesPresent = dates.ValueKind == JsonValueKind.Object;

        JsonElement providerData = default;
        bool statsPresent = a.TryGetProperty("statistics", out JsonElement statistics)
                            && statistics.ValueKind == JsonValueKind.Object
                            && statistics.TryGetProperty("provider-data", out providerData)
                            && providerData.ValueKind == JsonValueKind.Object;

        return new QueueRecord(
            Id: item.GetProperty("id").GetString() ?? string.Empty,
            Case: a.GetProperty("case").GetInt32(),
            Benefit: Text(a, "benefit"),
            Provider: Text(a, "provider"),
            ProviderCode: Text(a, "provider-code"),
            Place: Text(a, "place"),
            Address: Text(a, "address"),
            Locality: Text(a, "locality"),
            Phone: OptionalText(a, "phone"),
            TerytPlace: Text(a, "teryt-place"),
            Latitude: Number(a, "latitude"),
            Longitude: Number(a, "longitude"),
            ForChildren: OptionalText(a, "benefits-for-children") == "Y",
            Awaiting: statsPresent ? Int(providerData, "awaiting") : null,
            Removed: statsPresent ? Int(providerData, "removed") : null,
            AveragePeriodDays: statsPresent ? Int(providerData, "average-period") : null,
            StatsMonth: statsPresent ? OptionalText(providerData, "update") : null,
            PcusRaw: datesPresent ? OptionalText(dates, "pcus") : null,
            // Brak sekcji `dates` to brak przekazanej prognozy, a nie „PCUŚ nie dotyczy”.
            Applicable: !datesPresent || (dates.TryGetProperty("applicable", out JsonElement ap) && ap.ValueKind != JsonValueKind.False),
            AsAt: datesPresent ? OptionalText(dates, "date-situation-as-at") : null
        );
    }

    // API potrafi zwrócić puste ciągi z białymi znakami na brzegach ("ODDZIAŁ KARDIOLOGII ").
    private static string Text(JsonElement element, string name) => OptionalText(element, name) ?? string.Empty;

    private static string? OptionalText(JsonElement element, string name) =>
        element.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()?.Trim()
            : null;

    private static int? Int(JsonElement element, string name) =>
        element.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.Number
            ? value.GetInt32()
            : null;

    private static double? Number(JsonElement element, string name) =>
        element.TryGetProperty(name, out JsonElement value) && value.ValueKind == JsonValueKind.Number
            ? value.GetDouble()
            : null;
}
