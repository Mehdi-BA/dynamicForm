using System.Globalization;
using System.Text;
using Microsoft.AspNetCore.Mvc;

namespace DynamicForms.Api.Controllers;

/// <summary>
/// Référentiel de clients « riches », pensé pour démontrer l'auto-remplissage
/// (resultMappings) de bout en bout.
///
/// Contrairement aux référentiels key/value de <c>ReferentialsController</c>, chaque ligne
/// renvoyée porte plusieurs champs (ville, secteur, matricule). Un champ autocomplete branché
/// dessus (mode lookupUrl) reçoit l'objet brut dans <c>raw</c> côté front : à la sélection, ses
/// resultMappings peuvent alors recopier ville/secteur/matricule vers d'autres champs du
/// formulaire. C'est ce qu'un simple {key, value} ne permet pas d'illustrer.
/// </summary>
[ApiController]
[Route("api/clients")]
public sealed class ClientsController : ControllerBase
{
    public sealed record ClientDto(
        string Id,
        string RaisonSociale,
        string Ville,
        string Secteur,
        string Matricule);

    private static readonly ClientDto[] Clients =
    [
        new("1", "Société Alpha", "Tunis", "Distribution", "1234567A/M/000"),
        new("2", "Beta Distribution", "Sfax", "Agroalimentaire", "2345678B/M/000"),
        new("3", "Gamma Industries", "Sousse", "Industrie", "3456789C/M/000"),
        new("4", "Delta Services", "Ariana", "Services", "4567890D/M/000"),
        new("5", "Epsilon Trading", "Bizerte", "Négoce", "5678901E/M/000"),
        new("6", "Zeta Consulting", "Nabeul", "Conseil", "6789012F/M/000"),
        new("7", "Eta Logistique", "Gabès", "Transport", "7890123G/M/000"),
        new("8", "Theta Négoce", "Monastir", "Négoce", "8901234H/M/000"),
        new("9", "Iota Solutions", "Kairouan", "Informatique", "9012345I/M/000"),
        new("10", "Kappa Import Export", "Tunis", "Import-Export", "0123456J/M/000"),
    ];

    /// <summary>
    /// Recherche insensible à la casse et aux accents sur la raison sociale.
    /// Chaque ligne renvoyée est un objet complet — le front y pioche les champs à recopier.
    /// </summary>
    [HttpGet("search")]
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
