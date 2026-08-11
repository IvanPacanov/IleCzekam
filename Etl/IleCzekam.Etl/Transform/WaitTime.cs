namespace IleCzekam.Etl.Transform;

using System.Text.RegularExpressions;
using IleCzekam.Etl.Configuration;

/// <summary>Kubełek „pigułki” czasu oczekiwania pokazywanej pacjentowi.</summary>
public enum WaitBucket
{
    /// <summary>Prognoza jest, poniżej progu „krótko”.</summary>
    Krotko,
    Umiarkowanie,
    Dlugo,
    BardzoDlugo,

    /// <summary>Placówka nie przekazała prognozy (`dates: null`). NIGDY nie znaczy „0 dni”.</summary>
    BrakDanych,

    /// <summary>
    /// PCUŚ z definicji nie dotyczy tego świadczenia (`applicable: false`, `pcus: "-"`) -
    /// opieka domowa, hospicja. Osobny stan, żeby nie sugerować pacjentowi zaginionych danych.
    /// </summary>
    NieDotyczy,
}

/// <summary>
/// Prognozowany czas udzielenia świadczenia (PCUŚ) po transformacji.
///
/// API NFZ zwraca PCUŚ jako TEKST po polsku ("3 mies. 2 tyg."), nie jako liczbę dni -
/// dlatego trzymamy oryginał (<see cref="PcusRaw"/>) obok naszego wyliczenia
/// (<see cref="RawDays"/>). Dzięki temu zmiana reguły konwersji nie wymaga ponownego fetchu.
/// </summary>
public sealed record WaitTime(
    string? PcusRaw,
    int? RawDays,
    string HumanLabel,
    WaitBucket Bucket,
    bool Applicable,
    string? AsAt
)
{
    /// <summary>Czy wartość nadaje się do median i agregatów.</summary>
    public bool CountsTowardAggregates => RawDays is not null;
}

/// <summary>
/// Parser i formatter PCUŚ. Wzorce zaobserwowane empirycznie na pełnym snapshocie
/// woj. śląskiego (8 478 rekordów) - patrz RECON.md, sekcja 2:
/// "N dni" | "N dzień" | "N mies." | "N mies. N tyg." | "N mies. N tydz." | "-" | null.
/// </summary>
public static class Pcus
{
    /// <summary>Przelicznik miesiąca na dni. PCUŚ powyżej 30 dni ma ziarnistość tygodnia.</summary>
    public const int DaysPerMonth = 30;

    private static readonly Regex DaysPattern = new(@"^(\d+) (?:dni|dzień|dzien)$", RegexOptions.Compiled);
    private static readonly Regex MonthsPattern = new(@"^(\d+) mies\.(?: (\d+) (?:tyg\.|tydz\.))?$", RegexOptions.Compiled);

    /// <summary>
    /// Zamienia tekst PCUŚ na liczbę dni. Zwraca <c>null</c> dla braku wartości ("-", null,
    /// pusty). Rzuca <see cref="EtlException"/> dla wzorca, którego nie znamy - nowy format
    /// ze strony NFZ ma zatrzymać pipeline, a nie po cichu zniknąć z danych.
    /// </summary>
    public static int? ToDays(string? pcus)
    {
        if (string.IsNullOrWhiteSpace(pcus) || pcus == "-")
        {
            return null;
        }

        string text = pcus.Trim();

        Match days = DaysPattern.Match(text);
        if (days.Success)
        {
            return int.Parse(days.Groups[1].Value);
        }

        Match months = MonthsPattern.Match(text);
        if (months.Success)
        {
            int weeks = months.Groups[2].Success ? int.Parse(months.Groups[2].Value) : 0;
            return (int.Parse(months.Groups[1].Value) * DaysPerMonth) + (weeks * 7);
        }

        throw new EtlException(
            $"Nieznany format PCUŚ: '{pcus}'. API NFZ zmieniło format - zaktualizuj parser w Transform/WaitTime.cs.");
    }

    /// <summary>
    /// Etykieta dla pacjenta. Budowana WPROST z tekstu PCUŚ (nie z przeliczonych dni) -
    /// NFZ już podał zaokrągloną formę, my tylko rozwijamy skróty do pełnych polskich słów
    /// z poprawną odmianą.
    /// </summary>
    public static string ToHumanLabel(string? pcus)
    {
        if (string.IsNullOrWhiteSpace(pcus))
        {
            return "brak danych";
        }

        string text = pcus.Trim();

        if (text == "-")
        {
            return "nie dotyczy";
        }

        Match days = DaysPattern.Match(text);
        if (days.Success)
        {
            int count = int.Parse(days.Groups[1].Value);
            return count == 0 ? "bez oczekiwania" : $"ok. {count} {DeclineDay(count)}";
        }

        Match months = MonthsPattern.Match(text);
        if (months.Success)
        {
            int monthCount = int.Parse(months.Groups[1].Value);
            string label = $"ok. {monthCount} {DeclineMonth(monthCount)}";

            if (months.Groups[2].Success)
            {
                int weekCount = int.Parse(months.Groups[2].Value);
                label += $" i {weekCount} {DeclineWeek(weekCount)}";
            }

            return label;
        }

        throw new EtlException(
            $"Nieznany format PCUŚ: '{pcus}'. API NFZ zmieniło format - zaktualizuj parser w Transform/WaitTime.cs.");
    }

    /// <summary>
    /// Etykieta dla wartości WYLICZONYCH (mediany, agregaty), które nie mają tekstu z NFZ.
    /// Reguły zaokrągleń: &lt; 30 dni → dni, 30–84 → tygodnie, ≥ 85 → miesiące; zawsze z „ok.”.
    /// Dla pojedynczej placówki używamy <see cref="ToHumanLabel"/> - tam tekst przychodzi z API.
    /// </summary>
    public static string DaysToHumanLabel(int? days)
    {
        if (days is null)
        {
            return "brak danych";
        }

        int value = days.Value;

        if (value == 0)
        {
            return "bez oczekiwania";
        }

        if (value < 30)
        {
            return $"ok. {value} {DeclineDay(value)}";
        }

        if (value < 85)
        {
            int weeks = (int)Math.Round(value / 7.0, MidpointRounding.AwayFromZero);
            return $"ok. {weeks} {DeclineWeek(weeks)}";
        }

        int months = (int)Math.Round((double)value / DaysPerMonth, MidpointRounding.AwayFromZero);
        return $"ok. {months} {DeclineMonth(months)}";
    }

    public static WaitBucket ToBucket(int? days, bool applicable, WaitBucketsSettings thresholds)
    {
        if (!applicable)
        {
            return WaitBucket.NieDotyczy;
        }

        // Brak wartości NIGDY nie może zostać zmapowany na 0 dni ani na „krótko”.
        return days switch
        {
            null => WaitBucket.BrakDanych,
            var d when d <= thresholds.KrotkoMaxDays => WaitBucket.Krotko,
            var d when d <= thresholds.UmiarkowanieMaxDays => WaitBucket.Umiarkowanie,
            var d when d <= thresholds.DlugoMaxDays => WaitBucket.Dlugo,
            _ => WaitBucket.BardzoDlugo,
        };
    }

    /// <summary>Nazwa kubełka w JSON-ie serving (snake_case, po polsku).</summary>
    public static string BucketName(WaitBucket bucket) => bucket switch
    {
        WaitBucket.Krotko => "krotko",
        WaitBucket.Umiarkowanie => "umiarkowanie",
        WaitBucket.Dlugo => "dlugo",
        WaitBucket.BardzoDlugo => "bardzo_dlugo",
        WaitBucket.BrakDanych => "brak_danych",
        WaitBucket.NieDotyczy => "nie_dotyczy",
        _ => throw new ArgumentOutOfRangeException(nameof(bucket)),
    };

    private static string DeclineDay(int count) => count == 1 ? "dzień" : "dni";

    private static string DeclineMonth(int count) => Plural(count, "miesiąc", "miesiące", "miesięcy");

    private static string DeclineWeek(int count) => Plural(count, "tydzień", "tygodnie", "tygodni");

    /// <summary>Polska liczba mnoga: 1 / 2–4 / 5+ z wyjątkiem nastek (12–14).</summary>
    private static string Plural(int count, string one, string few, string many)
    {
        if (count == 1)
        {
            return one;
        }

        int lastTwo = count % 100;
        int last = count % 10;

        return last is >= 2 and <= 4 && lastTwo is < 12 or > 14 ? few : many;
    }
}
