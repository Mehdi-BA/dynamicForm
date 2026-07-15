using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Mvc;

namespace DynamicForms.Api.Controllers;

/// <summary>
/// Endpoint d'exemple : un référentiel de clients en mémoire, que la ressource « clients »
/// (data source) interroge côté front. But — donner de quoi tester le moteur d'autocomplete
/// et l'auto-remplissage de bout en bout, sans dépendre d'une API externe.
/// </summary>
[ApiController]
[Route("api/clients")]
public sealed class ClientsController : ControllerBase
{
    public sealed record ClientDto(string Id, string RaisonSociale, string Ville);

    private static readonly ClientDto[] Clients =
    [
        new("1", "Société Alpha", "Tunis"),
        new("2", "Beta Distribution", "Sfax"),
        new("3", "Gamma Industries", "Sousse"),
        new("4", "Delta Services", "Ariana"),
        new("5", "Epsilon Trading", "Bizerte"),
        new("6", "Zeta Consulting", "Nabeul"),
        new("7", "Eta Logistique", "Gabès"),
        new("8", "Theta Négoce", "Monastir"),
        new("9", "Iota Solutions", "Kairouan"),
        new("10", "Kappa Import Export", "Tunis"),
    ];

    /// <summary>Recherche insensible à la casse et aux accents sur la raison sociale.</summary>
    [HttpGet]
    public ActionResult<IEnumerable<ClientDto>> Search([FromQuery] string? q, [FromQuery] int take = 20)
    {
        var limit = Math.Clamp(take, 1, 100);

        if (string.IsNullOrWhiteSpace(q))
            return Ok(Clients.Take(limit));

        var needle = Normalize(q);

        return Ok(Clients
            .Where(c => Normalize(c.RaisonSociale).Contains(needle, StringComparison.Ordinal))
            .Take(limit));
    }

    private static string Normalize(string input)
    {
        var decomposed = input.Trim().ToLowerInvariant().Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);

        foreach (var c in decomposed)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            {
                sb.Append(c);
            }
        }

        return sb.ToString();
    }
}
