namespace IleCzekam.Etl;

/// <summary>Błąd konfiguracji lub danych zatrzymujący pipeline z czytelnym komunikatem.</summary>
public sealed class EtlException : Exception
{
    public EtlException(string message)
        : base(message) { }
}
