using DynamicForms.Api.Models;
using DynamicForms.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DynamicForms.Api.Controllers;

/// <summary>
/// CRUD des ressources (data sources). Le form builder les gère depuis l'onglet « Data Source »,
/// et les champs autocomplete y font référence par id.
/// </summary>
[ApiController]
[Route("api/resources")]
public sealed class ResourcesController(
    ResourceCatalog catalog,
    ILogger<ResourcesController> logger) : ControllerBase
{
    /// <summary>Liste des ressources complètes — le builder a besoin de l'objet entier (url, mapping…).</summary>
    [HttpGet]
    public ActionResult<IEnumerable<Resource>> List() => Ok(catalog.List());

    [HttpGet("{id}")]
    public ActionResult<Resource> Get(string id)
    {
        var resource = catalog.Get(id);
        return resource is null ? NotFound(new { message = $"Ressource '{id}' introuvable." }) : Ok(resource);
    }

    /// <summary>Crée ou remplace une ressource. L'id de la route fait foi.</summary>
    [HttpPut("{id}")]
    public IActionResult Save(string id, [FromBody] Resource resource)
    {
        resource.Id = id;

        var errors = Validate(resource);
        if (errors.Count > 0)
            return BadRequest(new { message = "Ressource invalide.", errors });

        var isNew = !catalog.Exists(id);
        catalog.Save(resource);

        logger.LogInformation("Ressource {ResourceId} {Action}.", id, isNew ? "créée" : "mise à jour");

        return isNew
            ? CreatedAtAction(nameof(Get), new { id }, resource)
            : Ok(resource);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id) =>
        catalog.Delete(id)
            ? NoContent()
            : NotFound(new { message = $"Ressource '{id}' introuvable." });

    /// <summary>Un minimum de cohérence : sans url ni mapping, la ressource ne produit rien côté front.</summary>
    private static List<string> Validate(Resource resource)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(resource.Id))
            errors.Add("L'identifiant de la ressource est obligatoire.");

        if (string.IsNullOrWhiteSpace(resource.Name))
            errors.Add("Le nom de la ressource est obligatoire.");

        if (string.IsNullOrWhiteSpace(resource.Url))
            errors.Add("L'URL de la ressource est obligatoire.");

        if (string.IsNullOrWhiteSpace(resource.Mapping.ValueField))
            errors.Add("Le champ « valeur » du mapping est obligatoire.");

        if (string.IsNullOrWhiteSpace(resource.Mapping.LabelField))
            errors.Add("Le champ « libellé » du mapping est obligatoire.");

        return errors;
    }
}
