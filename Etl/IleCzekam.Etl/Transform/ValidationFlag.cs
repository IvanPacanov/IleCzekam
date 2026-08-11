namespace IleCzekam.Etl.Transform;

/// <summary>
/// Flagi walidacji trafiające do processed i serving. Frontend używa ich do zastrzeżeń
/// przy danych; transform używa ich do wykluczania wartości z agregatów.
/// </summary>
public static class ValidationFlag
{
    /// <summary>Placówka nie przekazała prognozy. NIGDY nie znaczy „0 dni”.</summary>
    public const string NoData = "no_data";

    /// <summary>PCUŚ z definicji nie dotyczy tego świadczenia (opieka domowa, hospicja).</summary>
    public const string NotApplicable = "not_applicable";

    /// <summary>Wartość poza granicą wiarygodności — nie wchodzi do median.</summary>
    public const string SuspiciousValue = "suspicious_value";

    /// <summary>Statystyki placówki starsze niż próg z configu.</summary>
    public const string StaleData = "stale_data";

    /// <summary>Agregat policzony z mniej niż `low_sample_threshold` placówek.</summary>
    public const string LowSample = "low_sample";
}
