namespace IleCzekam.Etl.Configuration;

// Mutowalne POCO - wymóg deserializacji YamlDotNet.
public sealed class EtlSettings
{
    public ApiSettings Api { get; set; } = new();
    public ValidationSettings Validation { get; set; } = new();
    public WaitBucketsSettings WaitBuckets { get; set; } = new();
    public PathsSettings Paths { get; set; } = new();

    /// <summary>Kody województw wg oddziałów NFZ (01–16), nie TERYT.</summary>
    public List<string> Provinces { get; set; } = [];
}

public sealed class ApiSettings
{
    public string BaseUrl { get; set; } = string.Empty;

    /// <summary>Zmienna środowiskowa z wartością nagłówka User-Agent (identyfikacja klienta).</summary>
    public string UserAgentEnv { get; set; } = "NFZ_USER_AGENT";

    /// <summary>Pauza między zapytaniami. Regulamin NFZ: limit 10 zapytań/s na adres IP.</summary>
    public int ThrottleMs { get; set; } = 600;

    public int PageLimit { get; set; } = 25;
    public RetrySettings Retry { get; set; } = new();
}

public sealed class RetrySettings
{
    public int MaxAttempts { get; set; } = 5;
    public int InitialBackoffMs { get; set; } = 1000;
}

public sealed class ValidationSettings
{
    /// <summary>Powyżej tylu miesięcy od snapshotu dane placówki dostają flagę stale_data.</summary>
    public int StaleDataMonths { get; set; } = 3;

    /// <summary>Czas oczekiwania powyżej tylu dni traktujemy jako suspicious_value.</summary>
    public int MaxPlausibleDays { get; set; } = 1825;

    /// <summary>Poniżej tylu placówek z danymi agregat dostaje flagę low_sample.</summary>
    public int LowSampleThreshold { get; set; } = 3;
}

/// <summary>Progi „pigułki” czasu oczekiwania w dniach (górne granice kubełków).</summary>
public sealed class WaitBucketsSettings
{
    public int KrotkoMaxDays { get; set; } = 29;
    public int UmiarkowanieMaxDays { get; set; } = 90;
    public int DlugoMaxDays { get; set; } = 180;
}

public sealed class PathsSettings
{
    public string Raw { get; set; } = "data/raw";
    public string Processed { get; set; } = "data/processed";
    public string Serving { get; set; } = "data/serving";
    public string AnalyticsDb { get; set; } = "data/analytics.sqlite";
}
