namespace IleCzekam.Etl.Fetch;

/// <summary>Surowa odpowiedź API — treść trafia do warstwy raw bajt w bajt.</summary>
public sealed record NfzResponse(int StatusCode, string Body, string Url);

/// <summary>
/// Dostęp sieciowy do API NFZ. Wydzielony interfejsem, żeby testy fetch-a
/// nigdy nie biły w prawdziwe API.
/// </summary>
public interface INfzHttp
{
    Task<NfzResponse> GetAsync(
        string path,
        IReadOnlyList<KeyValuePair<string, string>> query,
        CancellationToken cancellationToken
    );
}
