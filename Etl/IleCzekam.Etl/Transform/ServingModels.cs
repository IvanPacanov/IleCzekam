using System.Text.Json.Serialization;

namespace IleCzekam.Etl.Transform;

/// <summary>Pigułka czasu oczekiwania w JSON-ie. Kolejność pól = kolejność w pliku.</summary>
public sealed record WaitDto(
    [property: JsonPropertyName("pcus_raw")] string? PcusRaw,
    [property: JsonPropertyName("raw_days")] int? RawDays,
    [property: JsonPropertyName("human_label")] string HumanLabel,
    [property: JsonPropertyName("bucket")] string Bucket,
    [property: JsonPropertyName("as_at")] string? AsAt
);

/// <summary>Jedna placówka na liście. Placówka BEZ danych też tu jest — z telefonem.</summary>
public sealed record PlaceDto(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("provider")] string Provider,
    [property: JsonPropertyName("place")] string Place,
    [property: JsonPropertyName("address")] string Address,
    [property: JsonPropertyName("locality")] string Locality,
    [property: JsonPropertyName("teryt")] string Teryt,
    [property: JsonPropertyName("phone")] string? Phone,
    [property: JsonPropertyName("latitude")] double? Latitude,
    [property: JsonPropertyName("longitude")] double? Longitude,
    [property: JsonPropertyName("for_children")] bool ForChildren,
    [property: JsonPropertyName("nfz_benefit")] string NfzBenefit,
    [property: JsonPropertyName("wait_stable")] WaitDto WaitStable,
    [property: JsonPropertyName("wait_urgent")] WaitDto? WaitUrgent,
    [property: JsonPropertyName("awaiting")] int? Awaiting,
    [property: JsonPropertyName("average_period_days")] int? AveragePeriodDays,
    [property: JsonPropertyName("stats_month")] string? StatsMonth,
    [property: JsonPropertyName("flags")] IReadOnlyList<string> Flags
);

/// <summary>Nagłówek-odpowiedź: mediana i najszybsza placówka.</summary>
public sealed record SummaryDto(
    [property: JsonPropertyName("median_days")] int? MedianDays,
    [property: JsonPropertyName("median_label")] string MedianLabel,
    [property: JsonPropertyName("median_bucket")] string MedianBucket,
    [property: JsonPropertyName("fastest")] FastestDto? Fastest,
    [property: JsonPropertyName("places_total")] int PlacesTotal,
    [property: JsonPropertyName("places_with_data")] int PlacesWithData,
    [property: JsonPropertyName("places_without_data")] int PlacesWithoutData,
    [property: JsonPropertyName("flags")] IReadOnlyList<string> Flags
);

public sealed record FastestDto(
    [property: JsonPropertyName("place_id")] string PlaceId,
    [property: JsonPropertyName("provider")] string Provider,
    [property: JsonPropertyName("locality")] string Locality,
    [property: JsonPropertyName("raw_days")] int RawDays,
    [property: JsonPropertyName("human_label")] string HumanLabel
);

public sealed record ComparisonDto(
    [property: JsonPropertyName("scope_median_days")] int? ScopeMedianDays,
    [property: JsonPropertyName("province_median_days")] int? ProvinceMedianDays,
    [property: JsonPropertyName("best_city_in_province")] BestCityDto? BestCityInProvince
);

public sealed record BestCityDto(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("slug")] string Slug,
    [property: JsonPropertyName("median_days")] int MedianDays,
    [property: JsonPropertyName("median_label")] string MedianLabel,
    [property: JsonPropertyName("low_sample")] bool LowSample
);

/// <summary>Punkt trendu — jeden miesięczny snapshot.</summary>
public sealed record TrendPointDto(
    [property: JsonPropertyName("month")] string Month,
    [property: JsonPropertyName("median_days")] int? MedianDays,
    [property: JsonPropertyName("places_with_data")] int PlacesWithData
);

public sealed record ScopeDto(
    [property: JsonPropertyName("type")] string Type,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("slug")] string Slug,
    [property: JsonPropertyName("teryt")] string? Teryt,
    [property: JsonPropertyName("province")] string Province
);

public sealed record BenefitDto(
    [property: JsonPropertyName("slug")] string Slug,
    [property: JsonPropertyName("label")] string Label,
    [property: JsonPropertyName("nfz_benefits")] IReadOnlyList<string> NfzBenefits
);

/// <summary>Plik serving pod jedną stronę: (świadczenie × miasto) albo (świadczenie × województwo).</summary>
public sealed record ServingFileDto(
    [property: JsonPropertyName("benefit")] BenefitDto Benefit,
    [property: JsonPropertyName("scope")] ScopeDto Scope,
    [property: JsonPropertyName("snapshot_month")] string SnapshotMonth,
    [property: JsonPropertyName("generated_at")] string GeneratedAt,
    [property: JsonPropertyName("source")] SourceDto Source,
    [property: JsonPropertyName("summary")] SummaryDto Summary,
    [property: JsonPropertyName("comparison")] ComparisonDto Comparison,
    [property: JsonPropertyName("trend")] IReadOnlyList<TrendPointDto> Trend,
    [property: JsonPropertyName("places")] IReadOnlyList<PlaceDto> Places
);

/// <summary>Atrybucja wymagana regulaminem API NFZ — musi dojechać aż na stronę.</summary>
public sealed record SourceDto(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("url")] string Url
)
{
    public static SourceDto Nfz { get; } = new("Narodowy Fundusz Zdrowia — Informator o Terminach Leczenia", "https://api.nfz.gov.pl/");
}

/// <summary>Wpis indeksu wyszukiwarki: świadczenie w mieście.</summary>
public sealed record SearchIndexEntryDto(
    [property: JsonPropertyName("benefit_slug")] string BenefitSlug,
    [property: JsonPropertyName("benefit_label")] string BenefitLabel,
    [property: JsonPropertyName("synonyms")] IReadOnlyList<string> Synonyms,
    [property: JsonPropertyName("city")] string City,
    [property: JsonPropertyName("city_slug")] string CitySlug,
    [property: JsonPropertyName("province")] string Province,
    [property: JsonPropertyName("median_days")] int? MedianDays,
    [property: JsonPropertyName("places_total")] int PlacesTotal
);
