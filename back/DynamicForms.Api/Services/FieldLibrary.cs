using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using DynamicForms.Api.Models;

namespace DynamicForms.Api.Services;

/// <summary>
/// La bibliothèque des champs métier : les modèles à partir desquels le form builder compose
/// ses formulaires.
///
/// Contrairement aux formulaires (<see cref="FormSchemaCatalog"/>, en mémoire), la bibliothèque
/// est <b>persistée sur disque</b> : elle est censée être stable dans le temps, et la perdre à
/// chaque redémarrage viderait le builder de sa palette.
///
/// Le dictionnaire est accédé en concurrence par les requêtes HTTP (le service est singleton),
/// d'où le ConcurrentDictionary. Mais celui-ci ne protège que le dictionnaire, pas le fichier :
/// les écritures passent donc par un lock.
/// </summary>
public sealed class FieldLibrary
{
    private readonly ConcurrentDictionary<string, FieldDefinition> _fields;
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

    public FieldLibrary(IWebHostEnvironment env, ILogger<FieldLibrary> logger)
    {
        // À la racine du projet, pas dans bin/ : celui-ci est nettoyé au rebuild et gitignoré.
        _filePath = Path.Combine(env.ContentRootPath, "field-library.json");
        _fields = new(StringComparer.OrdinalIgnoreCase);

        var loaded = Load(logger);

        if (loaded.Count == 0)
        {
            foreach (var field in Seed())
                _fields[field.Id] = field;

            Persist();
            logger.LogInformation("Bibliothèque de champs initialisée : {Path}", _filePath);
        }
        else
        {
            foreach (var field in loaded)
                _fields[field.Id] = field;

            logger.LogInformation("Bibliothèque de champs chargée ({Count} champs) : {Path}", loaded.Count, _filePath);
        }
    }

    public IEnumerable<FieldDefinition> List() =>
        _fields.Values.OrderBy(f => f.Label, StringComparer.CurrentCulture);

    public FieldDefinition? Get(string id) =>
        _fields.TryGetValue(id, out var field) ? field : null;

    public bool Exists(string id) => _fields.ContainsKey(id);

    /// <summary>Crée ou remplace un champ, puis persiste. C'est ce qu'appelle la page /fields.</summary>
    public void Save(FieldDefinition field)
    {
        _fields[field.Id] = field;
        Persist();
    }

    public bool Delete(string id)
    {
        if (!_fields.TryRemove(id, out _))
            return false;

        Persist();
        return true;
    }

    // -------------------------------------------------------------------------
    // Persistance
    // -------------------------------------------------------------------------

    private List<FieldDefinition> Load(ILogger<FieldLibrary> logger)
    {
        if (!File.Exists(_filePath))
            return [];

        try
        {
            var json = File.ReadAllText(_filePath);
            return JsonSerializer.Deserialize<List<FieldDefinition>>(json, JsonOptions) ?? [];
        }
        catch (Exception ex)
        {
            // Un fichier corrompu ne doit pas empêcher l'API de démarrer : on repart du seed.
            logger.LogError(ex, "Bibliothèque de champs illisible ({Path}) — reprise sur le seed.", _filePath);
            return [];
        }
    }

    /// <summary>
    /// Écriture atomique : on écrit un fichier temporaire puis on le déplace. Sans ça, un crash
    /// en cours d'écriture laisserait un JSON tronqué — or la bibliothèque est justement ce
    /// qu'on ne veut pas perdre.
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
    // Seed : de quoi composer un formulaire dès le premier démarrage
    // -------------------------------------------------------------------------

    private static List<FieldDefinition> Seed() =>
    [
        new()
        {
            Id = "nom",
            Label = "Nom",
            Icon = "person",
            Description = "Nom de famille.",
            Field = new FieldSchema
            {
                Type = "text",
                Name = "nom",
                Label = "Nom",
                Validators = [new ValidatorSchema { Type = "required" }],
            },
        },
        new()
        {
            Id = "prenom",
            Label = "Prénom",
            Icon = "badge",
            Field = new FieldSchema
            {
                Type = "text",
                Name = "prenom",
                Label = "Prénom",
                Validators =
                [
                    new ValidatorSchema { Type = "required" },
                    new ValidatorSchema { Type = "minLength", Value = 2 },
                ],
            },
        },
        new()
        {
            Id = "email",
            Label = "Email",
            Icon = "alternate_email",
            Description = "Adresse email, format vérifié.",
            Field = new FieldSchema
            {
                Type = "email",
                Name = "email",
                Label = "Email",
                Validators =
                [
                    new ValidatorSchema { Type = "required" },
                    new ValidatorSchema { Type = "email" },
                ],
            },
        },
        new()
        {
            Id = "telephone",
            Label = "Téléphone",
            Icon = "call",
            Field = new FieldSchema
            {
                Type = "text",
                Name = "telephone",
                Label = "Téléphone",
                Placeholder = "+216 20 000 000",
                Validators =
                [
                    new ValidatorSchema
                    {
                        Type = "pattern",
                        Value = @"^\+?[0-9 ]{8,15}$",
                        Message = "Numéro de téléphone invalide",
                    },
                ],
            },
        },
        new()
        {
            Id = "dateNaissance",
            Label = "Date de naissance",
            Icon = "calendar_today",
            Field = new FieldSchema
            {
                Type = "date",
                Name = "dateNaissance",
                Label = "Date de naissance",
            },
        },
        new()
        {
            Id = "notes",
            Label = "Notes",
            Icon = "notes",
            Field = new FieldSchema
            {
                Type = "textarea",
                Name = "notes",
                Label = "Notes",
                Validators = [new ValidatorSchema { Type = "maxLength", Value = 500 }],
            },
        },
        // Un conteneur : tout le bloc arrive d'un coup dans le formulaire.
        new()
        {
            Id = "adresse",
            Label = "Adresse",
            Icon = "home",
            Description = "Bloc complet : rue, ville, code postal.",
            Field = new FieldSchema
            {
                Type = "group",
                Name = "adresse",
                Label = "Adresse",
                Fields =
                [
                    new FieldSchema
                    {
                        Type = "text",
                        Name = "rue",
                        Label = "Rue",
                        Validators = [new ValidatorSchema { Type = "required" }],
                    },
                    new FieldSchema
                    {
                        Type = "text",
                        Name = "ville",
                        Label = "Ville",
                        Cols = 6,
                        Validators = [new ValidatorSchema { Type = "required" }],
                    },
                    new FieldSchema
                    {
                        Type = "text",
                        Name = "codePostal",
                        Label = "Code postal",
                        Cols = 6,
                        Validators =
                        [
                            new ValidatorSchema { Type = "pattern", Value = "^[0-9]{4}$", Message = "4 chiffres attendus" },
                        ],
                    },
                ],
            },
        },
    ];
}
