using System.Text.Json;
using DynamicForms.Api.Models;
using DynamicForms.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DynamicForms.Api.Controllers;

[ApiController]
[Route("api/forms")]
public sealed class FormsController(
    FormSchemaCatalog catalog,
    FormSchemaValidator validator,
    ILogger<FormsController> logger) : ControllerBase
{
    /// <summary>Liste des formulaires disponibles (id + titre), pour alimenter un sélecteur.</summary>
    [HttpGet]
    public ActionResult<IEnumerable<object>> List() => Ok(catalog.List());

    /// <summary>Schéma complet d'un formulaire. C'est ce que le moteur Angular consomme.</summary>
    [HttpGet("{id}")]
    public ActionResult<FormSchema> Get(string id)
    {
        var schema = catalog.Get(id);
        return schema is null ? NotFound(new { message = $"Formulaire '{id}' introuvable." }) : Ok(schema);
    }

    /// <summary>
    /// Crée ou remplace un schéma. C'est ce qu'appelle le form builder.
    /// Le schéma est validé avant d'être accepté : un schéma incohérent casserait
    /// le moteur côté front, là où l'erreur est bien plus dure à diagnostiquer.
    /// </summary>
    [HttpPut("{id}")]
    public IActionResult Save(string id, [FromBody] FormSchema schema)
    {
        // L'id de la route fait foi : le corps ne doit pas pouvoir écrire ailleurs.
        schema.Id = id;

        var errors = validator.Validate(schema);
        if (errors.Count > 0)
            return BadRequest(new { message = "Schéma invalide.", errors });

        var isNew = !catalog.Exists(id);
        catalog.Save(schema);

        logger.LogInformation("Schéma {FormId} {Action}.", id, isNew ? "créé" : "mis à jour");

        return isNew
            ? CreatedAtAction(nameof(Get), new { id }, schema)
            : Ok(schema);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id) =>
        catalog.Delete(id)
            ? NoContent()
            : NotFound(new { message = $"Formulaire '{id}' introuvable." });

    /// <summary>
    /// Réception des données saisies. On les renvoie telles quelles (echo) :
    /// pas de persistance, l'objectif est de vérifier la forme du payload produit par le moteur.
    /// </summary>
    [HttpPost("{id}/submit")]
    public IActionResult Submit(string id, [FromBody] JsonElement payload)
    {
        if (catalog.Get(id) is null)
            return NotFound(new { message = $"Formulaire '{id}' introuvable." });

        logger.LogInformation("Soumission du formulaire {FormId} : {Payload}", id, payload.ToString());

        return Ok(new
        {
            formId = id,
            receivedAt = DateTime.UtcNow,
            data = payload,
        });
    }
}
