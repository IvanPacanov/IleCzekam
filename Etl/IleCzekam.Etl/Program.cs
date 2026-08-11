using IleCzekam.Etl;
using IleCzekam.Etl.Configuration;

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
    return 64;
}

static Task<int> RunFetchAsync(string[] args)
{
    EtlSettings settings = ConfigLoader.LoadSettings(configDir);
    BenefitsConfig benefits = ConfigLoader.LoadBenefits(configDir);

    string benefitsArg = GetOption(args, "--benefits") ?? throw new EtlException("fetch wymaga --benefits <slug[,slug...]|all>");
    string provincesArg = GetOption(args, "--provinces") ?? throw new EtlException("fetch wymaga --provinces <kod[,kod...]|all>");

    IReadOnlyList<BenefitConfig> selected = ResolveBenefits(benefits, benefitsArg);
    IReadOnlyList<string> provinces = ResolveProvinces(settings, provincesArg);

    throw new EtlException(
        $"fetch nie jest jeszcze zaimplementowany (faza B). Wybrano świadczenia: "
        + $"{string.Join(", ", selected.Select(b => b.Slug))}; województwa: {string.Join(", ", provinces)}; "
        + $"API: {settings.Api.BaseUrl}"
    );
}

static int RunTransform()
{
    ConfigLoader.LoadSettings(configDir);
    ConfigLoader.LoadBenefits(configDir);

    throw new EtlException("transform nie jest jeszcze zaimplementowany (faza B).");
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
