namespace DynamicForms.Api.Models;

/// <summary>
/// Un champ métier de la bibliothèque : le modèle réutilisable à partir duquel le form builder
/// compose ses formulaires (Nom, Prénom, Adresse…).
///
/// Le builder en fait une <b>copie</b> : une fois posé dans un formulaire, le champ est
/// indépendant. Modifier la bibliothèque n'altère donc pas les formulaires déjà construits.
/// </summary>
public sealed class FieldDefinition
{
    /// <summary>Référence stable ('nom', 'adresse').</summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>Ce qu'affiche la palette du builder ('Nom du client').</summary>
    public string Label { get; set; } = string.Empty;

    /// <summary>Icône Material affichée dans la palette ('short_text').</summary>
    public string Icon { get; set; } = "short_text";

    /// <summary>Aide facultative, affichée dans la page de la bibliothèque.</summary>
    public string? Description { get; set; }

    /// <summary>
    /// Le modèle copié dans le formulaire : type, nom, libellé, validateurs, options,
    /// sous-champs d'un group/array…
    ///
    /// <see cref="FieldSchema.Cols"/> et <see cref="FieldSchema.VisibleIf"/> y existent mais
    /// sont ignorés à la copie : la largeur et la condition d'affichage dépendent du formulaire
    /// qui accueille le champ, pas du champ lui-même.
    /// </summary>
    public FieldSchema Field { get; set; } = new();
}
