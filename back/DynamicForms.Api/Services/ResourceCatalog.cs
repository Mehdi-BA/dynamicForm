using System.Collections.Concurrent;
using DynamicForms.Api.Models;

namespace DynamicForms.Api.Services;

/// <summary>
/// Catalogue en mémoire des ressources (data sources).
///
/// Comme <see cref="FormSchemaCatalog"/> : aucune base de données, une ressource d'exemple
/// est seedée au démarrage, celles créées par le form builder vivent dans le même
/// dictionnaire, et tout est perdu au redémarrage — suffisant ici, le sujet est le moteur.
///
/// Accédé en concurrence par les requêtes HTTP (singleton), d'où le ConcurrentDictionary.
/// </summary>
public sealed class ResourceCatalog
{
    private readonly ConcurrentDictionary<string, Resource> _resources;

    public ResourceCatalog()
    {
        _resources = new(StringComparer.OrdinalIgnoreCase);
        _resources["clients"] = BuildClientsResource();
    }

    public IEnumerable<Resource> List() =>
        _resources.Values.OrderBy(r => r.Name, StringComparer.CurrentCulture);

    public Resource? Get(string id) =>
        _resources.TryGetValue(id, out var resource) ? resource : null;

    /// <summary>Crée ou remplace une ressource. C'est ce qu'appelle le gestionnaire de ressources.</summary>
    public void Save(Resource resource) => _resources[resource.Id] = resource;

    public bool Exists(string id) => _resources.ContainsKey(id);

    public bool Delete(string id) => _resources.TryRemove(id, out _);

    /// <summary>
    /// Ressource d'exemple : interroge l'endpoint interne /api/clients et mappe chaque ligne
    /// en option. Les champs extra (ville) servent à l'auto-remplissage côté formulaire.
    /// </summary>
    private static Resource BuildClientsResource() => new()
    {
        Id = "clients",
        Name = "Clients",
        Url = "http://localhost:5244/api/clients",
        Method = "GET",
        Params =
        [
            new ResourceParam { Name = "q" },
            new ResourceParam { Name = "take", DefaultValue = "20" },
        ],
        Mapping = new ResourceMapping
        {
            ValueField = "id",
            LabelField = "raisonSociale",
            ExtraFields = ["ville", "raisonSociale"],
        },
    };
}
