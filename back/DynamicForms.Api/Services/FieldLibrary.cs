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

    /// <summary>
    /// Le modèle d'un champ, prêt à être posé dans un formulaire. C'est l'équivalent back de
    /// `addFieldFromLibrary()` côté builder : on copie, puis l'appelant contextualise (Cols,
    /// VisibleIf…).
    ///
    /// Clone profond : sans lui, deux formulaires partageraient le même objet et le second
    /// écraserait le contexte du premier.
    /// </summary>
    /// <exception cref="InvalidOperationException">Si l'id n'existe pas dans la bibliothèque.</exception>
    public FieldSchema Copy(string id)
    {
        var definition = Get(id)
            ?? throw new InvalidOperationException(
                $"Le champ « {id} » est absent de la bibliothèque, or un formulaire l'utilise. " +
                $"Rétablissez-le depuis la page /fields, ou supprimez « {_filePath} » " +
                "pour régénérer la bibliothèque d'origine.");

        return JsonSerializer.Deserialize<FieldSchema>(
            JsonSerializer.Serialize(definition.Field, JsonOptions), JsonOptions)!;
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
                    new FieldSchema
                    {
                        Type = "autocomplete",
                        Name = "pays",
                        Label = "Pays",
                        Placeholder = "Tapez pour rechercher…",
                        DataSourceId = "pays",
                        LookupUrl = "/api/referentials/pays/search",
                        LookupKeyField = "key",
                        LookupValueField = "value",
                        LookupQueryParam = "q",
                        Validators = [new ValidatorSchema { Type = "required" }],
                    },
                ],
            },
        },

        // --- Champs « fiche client » -----------------------------------------------------
        new()
        {
            Id = "clientType",
            Label = "Type de client",
            Icon = "radio_button_checked",
            Description = "Particulier ou professionnel — pilote l'affichage conditionnel.",
            Field = new FieldSchema
            {
                Type = "radio",
                Name = "clientType",
                Label = "Type de client",
                DefaultValue = "particulier",
                Validators = [new ValidatorSchema { Type = "required" }],
                Options =
                [
                    new OptionSchema { Value = "particulier", Label = "Particulier" },
                    new OptionSchema { Value = "pro", Label = "Professionnel" },
                ],
            },
        },
        new()
        {
            Id = "raisonSociale",
            Label = "Raison sociale",
            Icon = "business",
            Field = new FieldSchema
            {
                Type = "text",
                Name = "raisonSociale",
                Label = "Raison sociale",
                Validators = [new ValidatorSchema { Type = "required" }],
            },
        },
        new()
        {
            Id = "matriculeFiscal",
            Label = "Matricule fiscal",
            Icon = "receipt_long",
            Description = "Validé par le validateur custom « matriculeFiscal » du registre Angular.",
            Field = new FieldSchema
            {
                Type = "text",
                Name = "matriculeFiscal",
                Label = "Matricule fiscal",
                Placeholder = "1234567A/M/000",
                Hint = "Format : 1234567A/M/000",
                Validators =
                [
                    new ValidatorSchema { Type = "required" },
                    // Validateur custom : la logique vit dans le registre Angular, pas ici.
                    new ValidatorSchema { Type = "matriculeFiscal", Message = "Matricule fiscal invalide" },
                ],
            },
        },
        new()
        {
            Id = "assujettiTva",
            Label = "Assujetti à la TVA",
            Icon = "check_box",
            Field = new FieldSchema
            {
                Type = "checkbox",
                Name = "assujettiTva",
                Label = "Assujetti à la TVA",
                DefaultValue = true,
            },
        },
        new()
        {
            Id = "tauxTva",
            Label = "Taux de TVA",
            Icon = "percent",
            Field = new FieldSchema
            {
                Type = "number",
                Name = "tauxTva",
                Label = "Taux de TVA (%)",
                DefaultValue = 19,
                Validators =
                [
                    new ValidatorSchema { Type = "required" },
                    new ValidatorSchema { Type = "min", Value = 0 },
                    new ValidatorSchema { Type = "max", Value = 100 },
                ],
            },
        },
        new()
        {
            Id = "segment",
            Label = "Segment",
            Icon = "arrow_drop_down_circle",
            Field = new FieldSchema
            {
                Type = "select",
                Name = "segment",
                Label = "Segment",
                Options =
                [
                    new OptionSchema { Value = "vip", Label = "VIP" },
                    new OptionSchema { Value = "standard", Label = "Standard" },
                    new OptionSchema { Value = "prospect", Label = "Prospect" },
                ],
            },
        },
        new()
        {
            Id = "dateEntree",
            Label = "Client depuis le",
            Icon = "event",
            Field = new FieldSchema
            {
                Type = "date",
                Name = "dateEntree",
                Label = "Client depuis le",
                Validators = [new ValidatorSchema { Type = "required" }],
            },
        },
        new()
        {
            Id = "rattachement",
            Label = "Rattaché au client",
            Icon = "link",
            Description = "Autocomplete : choisir un client auto-remplit la ville de l'adresse.",
            Field = new FieldSchema
            {
                Type = "autocomplete",
                Name = "rattachement",
                Label = "Rattaché au client",
                Placeholder = "Tapez pour rechercher un client…",
                Hint = "Choisir un client remplit automatiquement la ville de l'adresse.",
                DataSourceId = "clients",
                // Le mapping est intrinsèque au champ : il fait partie de ce qu'il est.
                ResultMappings =
                [
                    new ResultMappingSchema { SourceField = "ville", TargetField = "adresse.ville" },
                ],
            },
        },
        // Une liste répétable : tout le bloc arrive d'un coup, comme « adresse ».
        new()
        {
            Id = "contacts",
            Label = "Contacts",
            Icon = "format_list_numbered",
            Description = "Liste répétable : nom, fonction et email par contact.",
            Field = new FieldSchema
            {
                Type = "array",
                Name = "contacts",
                Label = "Contacts",
                AddLabel = "Ajouter un contact",
                InitialItems = 1,
                Fields =
                [
                    new FieldSchema
                    {
                        Type = "text",
                        Name = "nom",
                        Label = "Nom du contact",
                        Cols = 4,
                        Validators = [new ValidatorSchema { Type = "required" }],
                    },
                    new FieldSchema
                    {
                        Type = "select",
                        Name = "fonction",
                        Label = "Fonction",
                        Cols = 4,
                        Options =
                        [
                            new OptionSchema { Value = "achat", Label = "Responsable achats" },
                            new OptionSchema { Value = "compta", Label = "Comptabilité" },
                            new OptionSchema { Value = "direction", Label = "Direction" },
                            new OptionSchema { Value = "autre", Label = "Autre" },
                        ],
                    },
                    new FieldSchema
                    {
                        Type = "email",
                        Name = "email",
                        Label = "Email",
                        Cols = 4,
                        Validators = [new ValidatorSchema { Type = "email" }],
                    },
                ],
            },
        },

        // --- Champs « demande de contact » -----------------------------------------------
        new()
        {
            Id = "sujet",
            Label = "Sujet",
            Icon = "topic",
            Field = new FieldSchema
            {
                Type = "select",
                Name = "sujet",
                Label = "Sujet",
                Validators = [new ValidatorSchema { Type = "required" }],
                Options =
                [
                    new OptionSchema { Value = "commercial", Label = "Question commerciale" },
                    new OptionSchema { Value = "support", Label = "Support technique" },
                    new OptionSchema { Value = "autre", Label = "Autre" },
                ],
            },
        },
        new()
        {
            Id = "message",
            Label = "Message",
            Icon = "chat",
            Field = new FieldSchema
            {
                Type = "textarea",
                Name = "message",
                Label = "Message",
                Validators =
                [
                    new ValidatorSchema { Type = "required" },
                    new ValidatorSchema { Type = "minLength", Value = 10 },
                ],
            },
        },
    ];
}
