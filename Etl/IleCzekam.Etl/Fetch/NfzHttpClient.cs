using System.Net;
using IleCzekam.Etl.Configuration;

namespace IleCzekam.Etl.Fetch;

/// <summary>
/// Klient API NFZ „Terminy Leczenia”.
///
/// Regulamin API dopuszcza 10 zapytań na sekundę na adres IP i zakazuje działań mogących
/// doprowadzić do przeciążenia — stąd throttling PRZED każdym zapytaniem (nie tylko między
/// stronami) oraz retry z wykładniczym backoffem na 429/5xx. Klucz API nie jest wymagany,
/// ale identyfikujemy się nagłówkiem User-Agent z adresem kontaktowym.
/// </summary>
public sealed class NfzHttpClient : INfzHttp, IDisposable
{
    private readonly HttpClient _http;
    private readonly ApiSettings _settings;
    private DateTimeOffset _nextRequestAllowedAt = DateTimeOffset.MinValue;

    public NfzHttpClient(ApiSettings settings, string userAgent)
    {
        _settings = settings;
        _http = new HttpClient { BaseAddress = new Uri(settings.BaseUrl), Timeout = TimeSpan.FromSeconds(60) };
        _http.DefaultRequestHeaders.Add("User-Agent", userAgent);
        _http.DefaultRequestHeaders.Add("Accept", "application/json");
    }

    public async Task<NfzResponse> GetAsync(
        string path,
        IReadOnlyList<KeyValuePair<string, string>> query,
        CancellationToken cancellationToken
    )
    {
        string url = $"{path}?{string.Join('&', query.Select(p => $"{Uri.EscapeDataString(p.Key)}={Uri.EscapeDataString(p.Value)}"))}";
        int backoffMs = _settings.Retry.InitialBackoffMs;

        for (int attempt = 1; ; attempt++)
        {
            await ThrottleAsync(cancellationToken);

            HttpResponseMessage response;
            try
            {
                response = await _http.GetAsync(url, cancellationToken);
            }
            catch (HttpRequestException exception) when (attempt < _settings.Retry.MaxAttempts)
            {
                Console.WriteLine($"  ! błąd sieci ({exception.Message}), ponawiam za {backoffMs} ms [{attempt}/{_settings.Retry.MaxAttempts}]");
                await Task.Delay(backoffMs, cancellationToken);
                backoffMs *= 2;
                continue;
            }

            using (response)
            {
                string body = await response.Content.ReadAsStringAsync(cancellationToken);
                int status = (int)response.StatusCode;

                bool retryable = response.StatusCode is HttpStatusCode.TooManyRequests || status >= 500;
                if (retryable && attempt < _settings.Retry.MaxAttempts)
                {
                    Console.WriteLine($"  ! HTTP {status}, ponawiam za {backoffMs} ms [{attempt}/{_settings.Retry.MaxAttempts}]");
                    await Task.Delay(backoffMs, cancellationToken);
                    backoffMs *= 2;
                    continue;
                }

                return new NfzResponse(status, body, new Uri(_http.BaseAddress!, url).ToString());
            }
        }
    }

    private async Task ThrottleAsync(CancellationToken cancellationToken)
    {
        TimeSpan wait = _nextRequestAllowedAt - DateTimeOffset.UtcNow;
        if (wait > TimeSpan.Zero)
        {
            await Task.Delay(wait, cancellationToken);
        }

        _nextRequestAllowedAt = DateTimeOffset.UtcNow.AddMilliseconds(_settings.ThrottleMs);
    }

    public void Dispose() => _http.Dispose();
}
