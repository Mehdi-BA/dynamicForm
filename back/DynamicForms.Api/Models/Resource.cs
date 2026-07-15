namespace DynamicForms.Api.Models;

/// <summary>
/// Une « ressource » (data source) : la description déclarative d'un appel d'API que le
/// moteur front exécute pour alimenter un champ autocomplete.
///
/// Le back ne fait que stocker et servir cet objet — il n'appelle jamais <see cref="Url"/>
/// lui-même. L'exécution (requête HTTP + mapping de la réponse) vit côté Angular.
/// </summary>
public sealed class Resource
{
    public string Id { get; set; } = string.Empty;

    /// <summary>Libellé lisible, affiché dans le form builder.</summary>
    public string Name { get; set; } = string.Empty;

    /// <summary>URL appelée par le front (ex: http://localhost:5244/api/clients).</summary>
    public string Url { get; set; } = string.Empty;

    /// <summary>Verbe HTTP. "GET" par défaut ; réservé pour extension.</summary>
    public string? Method { get; set; } = "GET";

    /// <summary>Paramètres de requête ajoutés à l'URL.</summary>
    public List<ResourceParam> Params { get; set; } = [];

    /// <summary>Comment transformer une ligne de la réponse en option {value, label, extra}.</summary>
    public ResourceMapping Mapping { get; set; } = new();
}

/// <summary>
/// Un paramètre de requête. La valeur runtime de la saisie utilisateur est injectée côté
/// front sur le paramètre nommé « q » ; les autres prennent leur <see cref="DefaultValue"/>.
/// </summary>
public sealed class ResourceParam
{
    public string Name { get; set; } = string.Empty;
    public string? DefaultValue { get; set; }
}

/// <summary>
/// Mapping des champs de la réponse JSON vers une option d'autocomplete.
/// </summary>
public sealed class ResourceMapping
{
    /// <summary>Champ de la réponse qui devient la valeur stockée (ex: "id").</summary>
    public string ValueField { get; set; } = string.Empty;

    /// <summary>Champ de la réponse qui devient le libellé affiché (ex: "raisonSociale").</summary>
    public string LabelField { get; set; } = string.Empty;

    /// <summary>Champs additionnels conservés sur l'option, pour l'auto-remplissage (ex: "ville").</summary>
    public List<string> ExtraFields { get; set; } = [];
}
