using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using DynamicForms.Api.Models;

namespace DynamicForms.Api.Services;

/// <summary>
/// Les sources de données (datasources) : la description d'un appel d'API réutilisable, qu'un
/// champ autocomplete ou select référence par identifiant.
///
/// Elles sont <b>globales</b> et vivent avec les champs, dans la page /fields : une datasource
/// fait partie de la définition d'un champ, pas du formulaire qui l'accueille. Un formulaire ne
/// les déclare donc plus — il les référence, et le back les lui sert
/// (voir <see cref="FormSchemaCatalog"/> et FormsController).
///
/// Persistées sur disque, comme <see cref="FieldLibrary"/> et pour la même raison : les perdre
/// à chaque redémarrage casserait tous les champs qui les référencent.
/// </summary>
public sealed class DataSourceLibrary
{
    private readonly ConcurrentDictionary<string, DataSourceDefinition> _sources;
    private readonly string _filePath;
    private readonly Lock _writeLock = new();

    /// <summary>
    /// Options propres au service : celles de Program.cs ne valent que pour le pipeline MVC.
    /// Sans ça, on écrirait du PascalCase sur disque et du camelCase sur le fil.
    /// </summary>
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        WriteIndented = true,
    };

    public DataSourceLibrary(IWebHostEnvironment env, ILogger<DataSourceLibrary> logger)
    {
        // À la racine du projet, pas dans bin/ : celui-ci est nettoyé au rebuild et gitignoré.
        _filePath = Path.Combine(env.ContentRootPath, "data-source-library.json");
        _sources = new(StringComparer.OrdinalIgnoreCase);

        var loaded = Load(logger);

        if (loaded.Count == 0)
        {
            foreach (var source in Seed())
                _sources[source.Id] = source;

            Persist();
            logger.LogInformation("Bibliothèque de datasources initialisée : {Path}", _filePath);
        }
        else
        {
            foreach (var source in loaded)
                _sources[source.Id] = source;

            logger.LogInformation(
                "Bibliothèque de datasources chargée ({Count}) : {Path}", loaded.Count, _filePath);
        }
    }

    public IEnumerable<DataSourceDefinition> List() =>
        _sources.Values.OrderBy(s => s.Label, StringComparer.CurrentCulture);

    public DataSourceDefinition? Get(string id) =>
        _sources.TryGetValue(id, out var source) ? source : null;

    public bool Exists(string id) => _sources.ContainsKey(id);

    /// <summary>Les identifiants connus — ce que le validateur de schéma vérifie.</summary>
    public IReadOnlyCollection<string> Ids() => [.. _sources.Keys];

    /// <summary>Crée ou remplace une datasource, puis persiste. C'est ce qu'appelle la page /fields.</summary>
    public void Save(DataSourceDefinition source)
    {
        _sources[source.Id] = source;
        Persist();
    }

    public bool Delete(string id)
    {
        if (!_sources.TryRemove(id, out _))
            return false;

        Persist();
        return true;
    }

    // -------------------------------------------------------------------------
    // Persistance
    // -------------------------------------------------------------------------

    private List<DataSourceDefinition> Load(ILogger<DataSourceLibrary> logger)
    {
        if (!File.Exists(_filePath))
            return [];

        try
        {
            var json = File.ReadAllText(_filePath);
            return JsonSerializer.Deserialize<List<DataSourceDefinition>>(json, JsonOptions) ?? [];
        }
        catch (Exception ex)
        {
            // Un fichier corrompu ne doit pas empêcher l'API de démarrer : on repart du seed.
            logger.LogError(ex, "Datasources illisibles ({Path}) — reprise sur le seed.", _filePath);
            return [];
        }
    }

    /// <summary>
    /// Écriture atomique : fichier temporaire puis déplacement. Sans ça, un crash en cours
    /// d'écriture laisserait un JSON tronqué.
    /// </summary>
    private void Persist()
    {
        lock (_writeLock)
        {
            var json = JsonSerializer.Serialize(List(), JsonOptions);
            var tmp = _filePath + ".tmp";

            File.WriteAllText(tmp, json);
            File.Move(tmp, _filePath, overwrite: true);
        }
    }

    // -------------------------------------------------------------------------
    // Seed : les deux sources que les champs de la bibliothèque référencent déjà
    // -------------------------------------------------------------------------

    private static List<DataSourceDefinition> Seed() =>
    [
        new()
        {
            Id = "pays",
            Label = "Pays",
            Url = "/api/referentials/pays/search",
            QueryParam = "q",
            ValueField = "key",
            DisplayField = "value",
            AvailableFields =
            [
                new DataSourceFieldDefinition { Path = "key", Label = "Code pays" },
                new DataSourceFieldDefinition { Path = "value", Label = "Libellé pays" },
            ],
        },
        // Source « riche » : chaque résultat porte plusieurs champs, ce qui permet à
        // l'autocomplete « rattachement » d'auto-remplir la ville à la sélection d'un client
        // (voir les ResultMappings du champ, dans la bibliothèque de champs).
        new()
        {
            Id = "clients",
            Label = "Clients",
            Url = "/api/clients/search",
            QueryParam = "q",
            ValueField = "id",
            DisplayField = "raisonSociale",
            AvailableFields =
            [
                new DataSourceFieldDefinition { Path = "raisonSociale", Label = "Raison sociale" },
                new DataSourceFieldDefinition { Path = "ville", Label = "Ville" },
                new DataSourceFieldDefinition { Path = "secteur", Label = "Secteur" },
                new DataSourceFieldDefinition { Path = "matricule", Label = "Matricule fiscal" },
            ],
        },
    ];
}
