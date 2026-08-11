namespace IleCzekam.Etl.Configuration;

// Mutowalne POCO — wymóg deserializacji YamlDotNet.
public sealed class BenefitsConfig
{
    public List<BenefitConfig> Benefits { get; set; } = [];
}

public sealed class BenefitConfig
{
    /// <summary>Identyfikator w URL-u i w ścieżkach data/serving, np. "kardiologia".</summary>
    public string Slug { get; set; } = string.Empty;

    /// <summary>Nazwa widoczna dla pacjenta, np. "Kardiolog".</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>
    /// Nazwy świadczeń DOKŁADNIE tak, jak w słowniku NFZ (/benefits) — parametr `benefit`
    /// w zapytaniu o kolejki jest dopasowaniem po nazwie, nie po kodzie.
    /// </summary>
    public List<string> NfzBenefits { get; set; } = [];

    /// <summary>Synonimy pacjenta pod wyszukiwarkę ("serce", "kardiolog dziecięcy").</summary>
    public List<string> Synonyms { get; set; } = [];
}
