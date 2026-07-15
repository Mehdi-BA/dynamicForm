namespace DynamicForms.Api.Services;

public sealed record LookupItem(string Value, string Label);
public sealed record ReferentialSource(string Name, int Count);
public sealed record ReferentialItem(string Key, string Value);

/// <summary>
/// Données de référence servies aux champs "autocomplete".
/// En mémoire : le but est de tester la recherche côté front, pas de gérer un référentiel.
/// </summary>
public sealed class LookupService
{
    private static readonly Dictionary<string, LookupItem[]> Sources = new(StringComparer.OrdinalIgnoreCase)
    {
        ["pays"] =
        [
            new("TN", "Tunisie"),
            new("DZ", "Algérie"),
            new("MA", "Maroc"),
            new("LY", "Libye"),
            new("EG", "Égypte"),
            new("FR", "France"),
            new("IT", "Italie"),
            new("ES", "Espagne"),
            new("DE", "Allemagne"),
            new("BE", "Belgique"),
            new("CH", "Suisse"),
            new("CA", "Canada"),
            new("US", "États-Unis"),
            new("GB", "Royaume-Uni"),
            new("SA", "Arabie saoudite"),
            new("AE", "Émirats arabes unis"),
            new("QA", "Qatar"),
            new("TR", "Turquie"),
        ],
        ["villes"] =
        [
            new("tunis", "Tunis"),
            new("sfax", "Sfax"),
            new("sousse", "Sousse"),
            new("kairouan", "Kairouan"),
            new("bizerte", "Bizerte"),
            new("gabes", "Gabès"),
            new("ariana", "Ariana"),
            new("gafsa", "Gafsa"),
            new("monastir", "Monastir"),
            new("nabeul", "Nabeul"),
        ],
    };

    /// <summary>Noms des sources disponibles — le form builder les propose dans une liste.</summary>
    public IReadOnlyList<string> SourceNames() => [.. Sources.Keys.Order()];

    /// <summary>Métadonnées des référentiels key/value disponibles.</summary>
    public IReadOnlyList<ReferentialSource> SourceDetails() =>
        [.. Sources
            .OrderBy(kvp => kvp.Key, StringComparer.CurrentCulture)
            .Select(kvp => new ReferentialSource(kvp.Key, kvp.Value.Length))];

    /// <summary>
    /// Recherche insensible à la casse et aux accents sur le libellé.
    /// Renvoie une liste vide si la source est inconnue — le front dégrade proprement.
    /// </summary>
    public IReadOnlyList<LookupItem> Search(string source, string? q, int take = 20)
    {
        if (!Sources.TryGetValue(source, out var items))
            return [];

        if (string.IsNullOrWhiteSpace(q))
            return items.Take(take).ToList();

        var needle = Normalize(q);

        return items
            .Where(i => Normalize(i.Label).Contains(needle, StringComparison.Ordinal))
            .Take(take)
            .ToList();
    }

    /// <summary>Résout un code en libellé, pour réafficher une valeur déjà enregistrée.</summary>
    public LookupItem? Resolve(string source, string value) =>
        Sources.TryGetValue(source, out var items)
            ? items.FirstOrDefault(i => string.Equals(i.Value, value, StringComparison.OrdinalIgnoreCase))
            : null;

    /// <summary>Projection key/value d'une recherche lookup.</summary>
    public IReadOnlyList<ReferentialItem> SearchReferential(string source, string? q, int take = 20) =>
        [.. Search(source, q, take).Select(i => new ReferentialItem(i.Value, i.Label))];

    /// <summary>Projection key/value d'une résolution lookup.</summary>
    public ReferentialItem? ResolveReferential(string source, string key)
    {
        var item = Resolve(source, key);
        return item is null ? null : new ReferentialItem(item.Value, item.Label);
    }

    private static string Normalize(string input)
    {
        var decomposed = input.Trim().ToLowerInvariant().Normalize(System.Text.NormalizationForm.FormD);
        var sb = new System.Text.StringBuilder(decomposed.Length);

        foreach (var c in decomposed)
        {
            if (System.Globalization.CharUnicodeInfo.GetUnicodeCategory(c)
                != System.Globalization.UnicodeCategory.NonSpacingMark)
            {
                sb.Append(c);
            }
        }

        return sb.ToString();
    }
}
