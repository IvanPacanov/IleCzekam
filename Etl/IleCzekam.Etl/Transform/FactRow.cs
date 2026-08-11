using System.Text.Json.Serialization;

namespace IleCzekam.Etl.Transform;

/// <summary>
/// Płaska tabela faktów: jeden wiersz na (miesiąc, świadczenie, województwo, placówka,
/// przypadek medyczny), po deduplikacji. Ziarno celowo najniższe z możliwych — wszystkie
/// zestawienia i procenty da się z tego policzyć, a formatem (JSON Lines) posłuży się
/// każde narzędzie: SQLite, DuckDB, pandas, arkusz.
///
/// To NIE jest warstwa serving — frontend czyta pliki `serving/`, nie fakty.
/// </summary>
public sealed record FactRow(
    [property: JsonPropertyName("month")] string Month,
    [property: JsonPropertyName("benefit_slug")] string BenefitSlug,
    [property: JsonPropertyName("benefit_label")] string BenefitLabel,
    [property: JsonPropertyName("nfz_benefit")] string NfzBenefit,
    [property: JsonPropertyName("province")] string Province,
    [property: JsonPropertyName("province_name")] string ProvinceName,
    [property: JsonPropertyName("city")] string City,
    [property: JsonPropertyName("city_slug")] string CitySlug,
    [property: JsonPropertyName("teryt")] string Teryt,
    [property: JsonPropertyName("place_id")] string PlaceId,
    [property: JsonPropertyName("provider")] string Provider,
    [property: JsonPropertyName("provider_code")] string ProviderCode,
    [property: JsonPropertyName("place")] string Place,
    [property: JsonPropertyName("address")] string Address,
    [property: JsonPropertyName("phone")] string? Phone,
    [property: JsonPropertyName("latitude")] double? Latitude,
    [property: JsonPropertyName("longitude")] double? Longitude,
    [property: JsonPropertyName("for_children")] bool ForChildren,
    [property: JsonPropertyName("case")] int Case,
    [property: JsonPropertyName("pcus_raw")] string? PcusRaw,
    [property: JsonPropertyName("raw_days")] int? RawDays,
    [property: JsonPropertyName("bucket")] string Bucket,
    [property: JsonPropertyName("applicable")] bool Applicable,
    [property: JsonPropertyName("as_at")] string? AsAt,
    [property: JsonPropertyName("awaiting")] int? Awaiting,
    [property: JsonPropertyName("removed")] int? Removed,
    [property: JsonPropertyName("average_period_days")] int? AveragePeriodDays,
    [property: JsonPropertyName("stats_month")] string? StatsMonth,
    [property: JsonPropertyName("no_data")] bool NoData,
    [property: JsonPropertyName("not_applicable")] bool NotApplicable,
    [property: JsonPropertyName("suspicious")] bool Suspicious,
    [property: JsonPropertyName("stale")] bool Stale
);
