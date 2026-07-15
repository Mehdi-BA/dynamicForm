using DynamicForms.Api.Services;
using Microsoft.AspNetCore.Mvc;

namespace DynamicForms.Api.Controllers;

[ApiController]
[Route("api/referentials")]
public sealed class ReferentialsController(LookupService lookup) : ControllerBase
{
    /// <summary>Référentiels key/value disponibles.</summary>
    [HttpGet]
    public ActionResult<IReadOnlyList<ReferentialSource>> Sources() => Ok(lookup.SourceDetails());

    /// <summary>
    /// Recherche key/value pour autocomplete.
    /// Ex: GET /api/referentials/pays/search?q=tun
    /// </summary>
    [HttpGet("{source}/search")]
    public ActionResult<IReadOnlyList<ReferentialItem>> Search(
        string source,
        [FromQuery] string? q,
        [FromQuery] int take = 20)
        => Ok(lookup.SearchReferential(source, q, Math.Clamp(take, 1, 100)));

    /// <summary>Résout une clé en item key/value (utile pour réafficher une valeur déjà stockée).</summary>
    [HttpGet("{source}/{key}")]
    public ActionResult<ReferentialItem> Resolve(string source, string key)
    {
        var item = lookup.ResolveReferential(source, key);
        return item is null ? NotFound() : Ok(item);
    }
}
