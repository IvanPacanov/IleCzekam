using System.Text;

namespace IleCzekam.Etl.Common;

/// <summary>
/// Slugi używane w ścieżkach plików i w URL-ach serwisu. Deterministyczne —
/// ta sama nazwa zawsze daje ten sam slug, niezależnie od kultury systemu.
/// </summary>
public static class Slug
{
    private static readonly Dictionary<char, string> PolishChars = new()
    {
        ['ą'] = "a", ['ć'] = "c", ['ę'] = "e", ['ł'] = "l", ['ń'] = "n",
        ['ó'] = "o", ['ś'] = "s", ['ź'] = "z", ['ż'] = "z",
    };

    public static string From(string text)
    {
        StringBuilder builder = new(text.Length);
        bool previousWasSeparator = false;

        foreach (char rune in text.ToLowerInvariant())
        {
            if (PolishChars.TryGetValue(rune, out string? replacement))
            {
                builder.Append(replacement);
                previousWasSeparator = false;
            }
            else if (rune is >= 'a' and <= 'z' or >= '0' and <= '9')
            {
                builder.Append(rune);
                previousWasSeparator = false;
            }
            else if (!previousWasSeparator && builder.Length > 0)
            {
                builder.Append('-');
                previousWasSeparator = true;
            }
        }

        return builder.ToString().Trim('-');
    }
}
