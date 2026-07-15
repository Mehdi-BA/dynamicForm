using DynamicForms.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DynamicForms.Api.Controllers;

[ApiController]
[Route("api/lookup")]
public sealed class LookupController(LookupService lookup) : ControllerBase
{
    /// <summary>
    /// Sources disponibles — le form builder les propose pour les champs autocomplete.
    /// Route racine et non "/sources" : ce dernier serait ambigu avec "/{source}".
    /// </summary>
    [HttpGet]
    public ActionResult<IReadOnlyList<string>> Sources() => Ok(lookup.SourceNames());

    /// <summary>Recherche pour les champs autocomplete : GET /api/lookup/pays?q=tun</summary>
    [HttpGet("{source}")]
    public ActionResult<IReadOnlyList<LookupItem>> Search(
        string source,
        [FromQuery] string? q,
        [FromQuery] int take = 20)
        => Ok(lookup.Search(source, q, Math.Clamp(take, 1, 100)));

    /// <summary>Résolution d'un code en libellé, pour réafficher une valeur existante.</summary>
    [HttpGet("{source}/{value}")]
    public ActionResult<LookupItem> Resolve(string source, string value)
    {
        var item = lookup.Resolve(source, value);
        return item is null ? NotFound() : Ok(item);
    }
}
