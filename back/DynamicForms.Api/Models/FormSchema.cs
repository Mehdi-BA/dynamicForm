namespace DynamicForms.Api.Models;

/// <summary>
/// Schéma d'un formulaire, tel que consommé par le moteur Angular.
///
/// Un schéma est soit un formulaire complet, soit un fragment réutilisable — voir <see cref="Kind"/>.
/// </summary>
public sealed class FormSchema
{
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// "form" (défaut) : formulaire complet, rendu avec sa carte, son titre et son bouton d'envoi.
    /// "fragment" : seulement les champs, destinés à être intégrés dans le formulaire d'une
    /// application hôte, qui fournit le FormGroup et pilote la validation et l'envoi.
    /// </summary>
    public string Kind { get; set; } = "form";

    /// <summary>Obligatoire pour un formulaire complet ; sans objet pour un fragment, qui n'affiche pas de titre.</summary>
    public string Title { get; set; } = string.Empty;

    public string? Description { get; set; }
    public string SubmitLabel { get; set; } = "Enregistrer";
    public List<FieldSchema> Fields { get; set; } = [];
    public List<DataSourceDefinition>? DataSources { get; set; }
}

/// <summary>
/// Un champ du formulaire. Un champ de type "group" ou "array" porte lui-même
/// des <see cref="Fields"/> : c'est ce qui rend la structure récursive.
/// </summary>
public sealed class FieldSchema
{
    /// <summary>text, textarea, number, email, password, select, autocomplete, date, checkbox, radio, group, array</summary>
    public string Type { get; set; } = "text";

    public string Name { get; set; } = string.Empty;
    public string? Label { get; set; }
    public string? Placeholder { get; set; }
    public string? Hint { get; set; }
    public object? DefaultValue { get; set; }
    public bool Disabled { get; set; }

    /// <summary>Largeur en colonnes sur une grille de 12.</summary>
    public int Cols { get; set; } = 12;

    public List<ValidatorSchema> Validators { get; set; } = [];

    /// <summary>Options statiques (select, radio).</summary>
    public List<OptionSchema>? Options { get; set; }

    /// <summary>Clé de lookup distant (autocomplete) : appelle GET /api/lookup/{LookupSource}?q=</summary>
    public string? LookupSource { get; set; }

    /// <summary>Identifiant d'une source de données déclarée au niveau du formulaire.</summary>
    public string? DataSourceId { get; set; }

    /// <summary>URL de recherche pour un autocomplete distant (ex: /api/referentials/pays/search).</summary>
    public string? LookupUrl { get; set; }

    /// <summary>Nom de la propriété contenant la clé dans la réponse API (ex: key, id, code).</summary>
    public string? LookupKeyField { get; set; }

    /// <summary>Nom de la propriété contenant le libellé dans la réponse API (ex: value, label, name).</summary>
    public string? LookupValueField { get; set; }

    /// <summary>Nom du paramètre query string utilisé pour la recherche (par défaut: q).</summary>
    public string? LookupQueryParam { get; set; }

    /// <summary>
    /// Mapping de champs à remplir depuis le résultat sélectionné (autocomplete/select).
    /// Exemple: sourceField="address.city" -> targetField="adresse.ville".
    /// </summary>
    public List<ResultMappingSchema>? ResultMappings { get; set; }

    /// <summary>Condition d'affichage. Le champ masqué est désactivé : exclu de la valeur et de la validation.</summary>
    public ConditionSchema? VisibleIf { get; set; }

    /// <summary>Sous-champs, pour Type = "group" ou "array".</summary>
    public List<FieldSchema>? Fields { get; set; }

    /// <summary>Pour Type = "array" : libellé du bouton d'ajout.</summary>
    public string? AddLabel { get; set; }

    /// <summary>Pour Type = "array" : nombre de lignes créées à l'initialisation.</summary>
    public int InitialItems { get; set; }
}

/// <summary>
/// Validateur déclaratif. "type" désigne une clé du registre côté Angular :
/// soit un validateur natif (required, email, min, max, minLength, maxLength, pattern),
/// soit un validateur custom enregistré par l'application (ex: matriculeFiscal).
/// </summary>
public sealed class ValidatorSchema
{
    public string Type { get; set; } = string.Empty;

    /// <summary>Argument du validateur : 5 pour min, "^[0-9]+$" pour pattern, etc.</summary>
    public object? Value { get; set; }

    /// <summary>Message affiché si le validateur échoue. Sinon message par défaut du registre.</summary>
    public string? Message { get; set; }
}

/// <summary>
/// Condition déclarative — volontairement pas d'expression JS à évaluer.
/// Soit une feuille (Field/Op/Value), soit un noeud logique (And/Or).
/// </summary>
public sealed class ConditionSchema
{
    /// <summary>Chemin du champ observé, relatif au formulaire racine (ex: "clientType", "adresse.pays").</summary>
    public string? Field { get; set; }

    /// <summary>eq, neq, in, notIn, gt, gte, lt, lte, truthy, falsy</summary>
    public string? Op { get; set; }

    public object? Value { get; set; }

    /// <summary>Toutes les sous-conditions doivent être vraies.</summary>
    public List<ConditionSchema>? And { get; set; }

    /// <summary>Au moins une sous-condition doit être vraie.</summary>
    public List<ConditionSchema>? Or { get; set; }
}

public sealed class OptionSchema
{
    public object? Value { get; set; }
    public string Label { get; set; } = string.Empty;

    /// <summary>Données additionnelles optionnelles pour les mappings depuis un select.</summary>
    public Dictionary<string, object?>? Data { get; set; }
}

public sealed class ResultMappingSchema
{
    /// <summary>Chemin de la valeur dans l'objet résultat sélectionné (value, label, data.code...).</summary>
    public string SourceField { get; set; } = string.Empty;

    /// <summary>Chemin du contrôle cible dans le formulaire (notation pointée).</summary>
    public string TargetField { get; set; } = string.Empty;
}

public sealed class DataSourceDefinition
{
    public string Id { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string Url { get; set; } = string.Empty;
    public string? QueryParam { get; set; }
    public string ValueField { get; set; } = string.Empty;
    public string DisplayField { get; set; } = string.Empty;
    public List<DataSourceFieldDefinition>? AvailableFields { get; set; }
}

public sealed class DataSourceFieldDefinition
{
    public string Path { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
}
