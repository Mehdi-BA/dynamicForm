namespace DynamicForms.Api.Models;

/// <summary>
/// Schéma complet d'un formulaire, tel que consommé par le moteur Angular.
/// </summary>
public sealed class FormSchema
{
    public string Id { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string SubmitLabel { get; set; } = "Enregistrer";
    public List<FieldSchema> Fields { get; set; } = [];
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

    /// <summary>Autocomplete : id de la ressource (data source) que le front exécute pour lister les options.</summary>
    public string? ResourceId { get; set; }

    /// <summary>Autocomplete : règles d'auto-remplissage déclenchées à la sélection d'une option.</summary>
    public List<FillRuleSchema>? Fill { get; set; }

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
}

/// <summary>
/// Règle d'auto-remplissage d'un champ autocomplete : à la sélection d'une option, la
/// valeur du champ extra <see cref="From"/> de l'option est écrite dans le champ du
/// formulaire désigné par <see cref="To"/> (chemin pointé, ex: "adresse.ville").
/// </summary>
public sealed class FillRuleSchema
{
    /// <summary>Clé d'un champ extra de la ressource (ex: "ville").</summary>
    public string From { get; set; } = string.Empty;

    /// <summary>Chemin du champ du formulaire à remplir (ex: "adresse.ville").</summary>
    public string To { get; set; } = string.Empty;
}
