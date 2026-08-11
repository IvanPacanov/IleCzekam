using YamlDotNet.Serialization;
using YamlDotNet.Serialization.NamingConventions;

namespace IleCzekam.Etl.Configuration;

public static class ConfigLoader
{
    private static readonly IDeserializer Deserializer = new DeserializerBuilder()
        .WithNamingConvention(UnderscoredNamingConvention.Instance)
        .IgnoreUnmatchedProperties()
        .Build();

    public static EtlSettings LoadSettings(string configDir) =>
        Load<EtlSettings>(Path.Combine(configDir, "settings.yml"));

    public static BenefitsConfig LoadBenefits(string configDir) =>
        Load<BenefitsConfig>(Path.Combine(configDir, "benefits.yml"));

    private static T Load<T>(string path)
    {
        if (!File.Exists(path))
        {
            throw new FileNotFoundException($"Brak pliku konfiguracyjnego: {path}");
        }

        using StreamReader reader = File.OpenText(path);
        return Deserializer.Deserialize<T>(reader);
    }
}
