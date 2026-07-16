using DynamicForms.Api.Models;
using DynamicForms.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DynamicForms.Api.Controllers;

/// <summary>
/// CRUD des sources de données. La page /fields les gère, et les champs autocomplete/select
/// les référencent par identifiant.
/// </summary>
[ApiController]
[Route("api/datasources")]
public sealed class DataSourcesController(
    DataSourceLibrary library,
    ILogger<DataSourcesController> logger) : ControllerBase
{
    [HttpGet]
    public ActionResult<IEnumerable<DataSourceDefinition>> List() => Ok(library.List());

    [HttpGet("{id}")]
    public ActionResult<DataSourceDefinition> Get(string id)
    {
        var source = library.Get(id);
        return source is null
            ? NotFound(new { message = $"Source de données '{id}' introuvable." })
            : Ok(source);
    }

    /// <summary>Crée ou remplace une source de données. L'id de la route fait foi.</summary>
    [HttpPut("{id}")]
    public IActionResult Save(string id, [FromBody] DataSourceDefinition source)
    {
        source.Id = id;

        var errors = Validate(source);
        if (errors.Count > 0)
            return BadRequest(new { message = "Source de données invalide.", errors });

        var isNew = !library.Exists(id);
        library.Save(source);

        logger.LogInformation("Source de données {SourceId} {Action}.", id, isNew ? "créée" : "mise à jour");

        return isNew
            ? CreatedAtAction(nameof(Get), new { id }, source)
            : Ok(source);
    }

    [HttpDelete("{id}")]
    public IActionResult Delete(string id) =>
        library.Delete(id)
            ? NoContent()
            : NotFound(new { message = $"Source de données '{id}' introuvable." });

    /// <summary>
    /// Les règles qui vivaient dans FormSchemaValidator : elles appartiennent à la source
    /// elle-même, pas aux formulaires qui la référencent.
    /// </summary>
    private static List<string> Validate(DataSourceDefinition source)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(source.Id))
            errors.Add("L'identifiant de la source de données est obligatoire.");

        if (string.IsNullOrWhiteSpace(source.Label))
            errors.Add($"La source de données « {source.Id} » doit avoir un libellé.");

        if (string.IsNullOrWhiteSpace(source.Url))
            errors.Add($"La source de données « {source.Id} » doit avoir une URL.");

        if (string.IsNullOrWhiteSpace(source.ValueField))
            errors.Add($"La source de données « {source.Id} » doit définir valueField.");

        if (string.IsNullOrWhiteSpace(source.DisplayField))
            errors.Add($"La source de données « {source.Id} » doit définir displayField.");

        return errors;
    }
}
