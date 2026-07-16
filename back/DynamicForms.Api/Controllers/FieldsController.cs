using DynamicForms.Api.Models;
using DynamicForms.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DynamicForms.Api.Controllers;

/// <summary>
/// CRUD de la bibliothèque de champs métier. La page /fields la gère, et le form builder
/// s'en sert comme palette : tout champ d'un formulaire vient de là.
/// </summary>
[ApiController]
[Route("api/fields")]
public sealed class FieldsController(
    FieldLibrary library,
    ILogger<FieldsController> logger) : ControllerBase
{
    /// <summary>Les champs disponibles, en entier : la palette a besoin du modèle à copier.</summary>
    [HttpGet]
    public ActionResult<IEnumerable<FieldDefinition>> List() => Ok(library.List());

    [HttpGet("{id}")]
    public ActionResult<FieldDefinition> Get(string id)
    {
        var field = library.Get(id);
        return field is null ? NotFound(new { message = $"Champ '{id}' introuvable." }) : Ok(field);
    }

    /// <summary>Crée ou remplace un champ. L'id de la route fait foi.</summary>
    [HttpPut("{id}")]
    public IActionResult Save(string id, [FromBody] FieldDefinition field)
    {
        field.Id = id;

        var errors = Validate(field);
        if (errors.Count > 0)
            return BadRequest(new { message = "Champ invalide.", errors });

        var isNew = !library.Exists(id);
        library.Save(field);

        logger.LogInformation("Champ {FieldId} {Action}.", id, isNew ? "créé" : "mis à jour");

        return isNew
            ? CreatedAtAction(nameof(Get), new { id }, field)
            : Ok(field);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id) =>
        library.Delete(id)
            ? NoContent()
            : NotFound(new { message = $"Champ '{id}' introuvable." });

    /// <summary>
    /// Un champ incohérent casserait le builder au moment de la copie, là où l'erreur serait
    /// bien plus difficile à rattacher à sa cause.
    /// </summary>
    private static List<string> Validate(FieldDefinition definition)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(definition.Id))
            errors.Add("L'identifiant du champ est obligatoire.");

        if (string.IsNullOrWhiteSpace(definition.Label))
            errors.Add("Le libellé du champ est obligatoire.");

        if (string.IsNullOrWhiteSpace(definition.Field.Type))
            errors.Add("Le type du champ est obligatoire.");

        if (string.IsNullOrWhiteSpace(definition.Field.Name))
            errors.Add("Le nom technique du champ est obligatoire.");

        // Un conteneur sans enfants ne rend rien : c'est presque toujours un oubli.
        if (definition.Field.Type is "group" or "array"
            && (definition.Field.Fields is null || definition.Field.Fields.Count == 0))
        {
            errors.Add($"Le champ « {definition.Label} » est de type « {definition.Field.Type} » mais n'a aucun sous-champ.");
        }

        return errors;
    }
}
