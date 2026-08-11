using IleCzekam.Etl;
using IleCzekam.Etl.Analytics;
using IleCzekam.Etl.Configuration;
using IleCzekam.Etl.Fetch;
using IleCzekam.Etl.Raw;
using IleCzekam.Etl.Transform;

// ETL czasów oczekiwania NFZ (API Terminy Leczenia). Dwa niezależne polecenia:
//   fetch --benefits <slug[,slug...]|all> --provinces <kod[,kod...]|all>   (sieć -> data/raw/snapshots/{YYYY-MM})
//   transform                                                              (data/raw + config -> processed + serving)
// Uruchamiane z katalogu repo (tam, gdzie leżą config/ i data/), np.:
//   dotnet run --project Etl/IleCzekam.Etl -- fetch --benefits kardiologia --provinces 12

const string configDir = "config";

try
{
    return args.FirstOrDefault() switch
    {
        "fetch" => await RunFetchAsync(args.Skip(1).ToArray()),
        "transform" => RunTransform(),
        "db" => RunDb(),
        _ => PrintUsage(),
    };
}
catch (EtlException exception)
{
    Console.Error.WriteLine($"BŁĄD: {exception.Message}");
    return 2;
}

static int PrintUsage()
{
    Console.Error.WriteLine("Użycie:");
    Console.Error.WriteLine("  fetch --benefits <slug[,slug...]|all> --provinces <kod[,kod...]|all>");
    Console.Error.WriteLine("  transform");
    Console.Error.WriteLine("  db          (processed/facts.jsonl -> baza analityczna SQLite)");
    return 64;
}

static async Task<int> RunFetchAsync(string[] args)
{
    EtlSettings settings = ConfigLoader.LoadSettings(configDir);
    BenefitsConfig benefits = ConfigLoader.LoadBenefits(configDir);

    string benefitsArg = GetOption(args, "--benefits") ?? throw new EtlException("fetch wymaga --benefits <slug[,slug...]|all>");
    string provincesArg = GetOption(args, "--provinces") ?? throw new EtlException("fetch wymaga --provinces <kod[,kod...]|all>");

    IReadOnlyList<BenefitConfig> selected = ResolveBenefits(benefits, benefitsArg);
    IReadOnlyList<string> provinces = ResolveProvinces(settings, provincesArg);

    // Regulamin API nie wymaga klucza, ale identyfikacja klienta pozwala NFZ skontaktować się
    // z nami zamiast blokować ruch. Bez zmiennej — działamy, tylko głośno o tym mówimy.
    string? userAgent = Environment.GetEnvironmentVariable(settings.Api.UserAgentEnv);
    if (string.IsNullOrWhiteSpace(userAgent))
    {
        userAgent = "ileczekam.pl/0.1 (+https://ileczekam.pl)";
        Console.WriteLine($"Uwaga: brak {settings.Api.UserAgentEnv} w env — używam domyślnego User-Agent bez kontaktu.");
    }

    using NfzHttpClient http = new(settings.Api, userAgent);
    FetchCommand fetch = new(http, new RawStore(settings.Paths.Raw), settings);

    return await fetch.RunAsync(selected, provinces, DateTimeOffset.Now, CancellationToken.None);
}

static int RunTransform()
{
    EtlSettings settings = ConfigLoader.LoadSettings(configDir);
    BenefitsConfig benefits = ConfigLoader.LoadBenefits(configDir);

    TransformCommand transform = new(new RawStore(settings.Paths.Raw), settings, benefits);
    return transform.Run(DateTimeOffset.Now);
}

static int RunDb()
{
    EtlSettings settings = ConfigLoader.LoadSettings(configDir);

    SqliteExporter.ExportResult result = new SqliteExporter(settings.Paths.AnalyticsDb)
        .Export(TransformCommand.FactsPath(settings));

    Console.WriteLine($"Załadowano {result.FactRows} faktów -> {result.DatabasePath}");
    Console.WriteLine($"Agregaty: city_month_stats {result.CityStatRows} wierszy, province_month_stats {result.ProvinceStatRows}");
    Console.WriteLine("Gotowe zapytania: queries/*.sql — np. sqlite3 data/analytics.sqlite < queries/ranking-miast.sql");
    return 0;
}

static IReadOnlyList<BenefitConfig> ResolveBenefits(BenefitsConfig config, string arg)
{
    if (arg.Equals("all", StringComparison.OrdinalIgnoreCase))
    {
        return config.Benefits;
    }

    List<string> requested = arg
        .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
        .ToList();

    List<BenefitConfig> resolved = [];
    List<string> unknown = [];

    foreach (string slug in requested)
    {
        BenefitConfig? benefit = config.Benefits.FirstOrDefault(b => b.Slug == slug);
        if (benefit is null)
        {
            unknown.Add(slug);
        }
        else
        {
            resolved.Add(benefit);
        }
    }

    return unknown.Count > 0
        ? throw new EtlException($"Nieznane świadczenia (brak w config/benefits.yml): {string.Join(", ", unknown)}")
        : resolved;
}

static IReadOnlyList<string> ResolveProvinces(EtlSettings settings, string arg)
{
    if (arg.Equals("all", StringComparison.OrdinalIgnoreCase))
    {
        return settings.Provinces;
    }

    List<string> requested = arg
        .Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
        .ToList();

    List<string> unknown = requested.Where(code => !settings.Provinces.Contains(code)).ToList();

    return unknown.Count > 0
        ? throw new EtlException(
            $"Nieznane kody województw (dopuszczalne 01–16 wg oddziałów NFZ, patrz config/settings.yml): {string.Join(", ", unknown)}")
        : requested;
}

static string? GetOption(string[] args, string name)
{
    int index = Array.IndexOf(args, name);
    return index >= 0 && index + 1 < args.Length ? args[index + 1] : null;
}
