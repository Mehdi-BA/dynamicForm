using System.Collections.Concurrent;
using DynamicForms.Api.Models;

namespace DynamicForms.Api.Services;

/// <summary>
/// Catalogue en mémoire des schémas de formulaires.
///
/// Aucune base de données : les schémas d'exemple sont construits au démarrage, et ceux
/// créés par le form builder vivent dans le même dictionnaire. Ils sont donc perdus au
/// redémarrage — suffisant ici, puisque le sujet est le moteur, pas la persistance.
///
/// Le dictionnaire est accédé en concurrence par les requêtes HTTP (le service est
/// singleton), d'où le ConcurrentDictionary.
/// </summary>
public sealed class FormSchemaCatalog
{
    private readonly ConcurrentDictionary<string, FormSchema> _schemas;

    public FormSchemaCatalog()
    {
        _schemas = new(StringComparer.OrdinalIgnoreCase);
        _schemas["client"] = BuildClientForm();
        _schemas["contact"] = BuildContactForm();
    }

    public IEnumerable<object> List() =>
        _schemas.Values
            .OrderBy(s => s.Title, StringComparer.CurrentCulture)
            .Select(s => new { s.Id, s.Title, s.Description });

    public FormSchema? Get(string id) =>
        _schemas.TryGetValue(id, out var schema) ? schema : null;

    /// <summary>Crée ou remplace un schéma. C'est ce qu'appelle le form builder.</summary>
    public void Save(FormSchema schema) => _schemas[schema.Id] = schema;

    public bool Exists(string id) => _schemas.ContainsKey(id);

    public bool Delete(string id) => _schemas.TryRemove(id, out _);

    /// <summary>
    /// Fiche client : exerce le conditionnel (visibleIf), le sous-formulaire (group),
    /// la liste répétable (array), l'autocomplete distant et un validateur custom.
    /// </summary>
    private static FormSchema BuildClientForm() => new()
    {
        Id = "client",
        Title = "Fiche client",
        Description = "Formulaire complet : champs conditionnels, sous-formulaire adresse, liste de contacts.",
        SubmitLabel = "Enregistrer le client",
        Fields =
        [
            new FieldSchema
            {
                Type = "radio",
                Name = "clientType",
                Label = "Type de client",
                DefaultValue = "particulier",
                Cols = 12,
                Validators = [new ValidatorSchema { Type = "required" }],
                Options =
                [
                    new OptionSchema { Value = "particulier", Label = "Particulier" },
                    new OptionSchema { Value = "pro", Label = "Professionnel" },
                ],
            },

            // --- Bloc particulier : visible seulement si clientType == "particulier" ---
            new FieldSchema
            {
                Type = "text",
                Name = "prenom",
                Label = "Prénom",
                Cols = 6,
                Validators =
                [
                    new ValidatorSchema { Type = "required" },
                    new ValidatorSchema { Type = "minLength", Value = 2 },
                ],
                VisibleIf = new ConditionSchema { Field = "clientType", Op = "eq", Value = "particulier" },
            },
            new FieldSchema
            {
                Type = "text",
                Name = "nom",
                Label = "Nom",
                Cols = 6,
                Validators = [new ValidatorSchema { Type = "required" }],
                VisibleIf = new ConditionSchema { Field = "clientType", Op = "eq", Value = "particulier" },
            },

            // --- Bloc professionnel : visible seulement si clientType == "pro" ---
            new FieldSchema
            {
                Type = "text",
                Name = "raisonSociale",
                Label = "Raison sociale",
                Cols = 6,
                Validators = [new ValidatorSchema { Type = "required" }],
                VisibleIf = new ConditionSchema { Field = "clientType", Op = "eq", Value = "pro" },
            },
            new FieldSchema
            {
                Type = "text",
                Name = "matriculeFiscal",
                Label = "Matricule fiscal",
                Placeholder = "1234567A/M/000",
                Hint = "Format : 1234567A/M/000",
                Cols = 6,
                Validators =
                [
                    new ValidatorSchema { Type = "required" },
                    // Validateur custom : la logique vit dans le registre Angular, pas ici.
                    new ValidatorSchema { Type = "matriculeFiscal", Message = "Matricule fiscal invalide" },
                ],
                VisibleIf = new ConditionSchema { Field = "clientType", Op = "eq", Value = "pro" },
            },
            new FieldSchema
            {
                Type = "checkbox",
                Name = "assujettiTva",
                Label = "Assujetti à la TVA",
                DefaultValue = true,
                Cols = 6,
                VisibleIf = new ConditionSchema { Field = "clientType", Op = "eq", Value = "pro" },
            },
            new FieldSchema
            {
                Type = "number",
                Name = "tauxTva",
                Label = "Taux de TVA (%)",
                DefaultValue = 19,
                Cols = 6,
                Validators =
                [
                    new ValidatorSchema { Type = "required" },
                    new ValidatorSchema { Type = "min", Value = 0 },
                    new ValidatorSchema { Type = "max", Value = 100 },
                ],
                // Condition composée : pro ET assujetti.
                VisibleIf = new ConditionSchema
                {
                    And =
                    [
                        new ConditionSchema { Field = "clientType", Op = "eq", Value = "pro" },
                        new ConditionSchema { Field = "assujettiTva", Op = "truthy" },
                    ],
                },
            },

            // --- Champs communs ---
            new FieldSchema
            {
                Type = "email",
                Name = "email",
                Label = "Email",
                Cols = 6,
                Validators =
                [
                    new ValidatorSchema { Type = "required" },
                    new ValidatorSchema { Type = "email" },
                ],
            },
            new FieldSchema
            {
                Type = "text",
                Name = "telephone",
                Label = "Téléphone",
                Placeholder = "+216 20 000 000",
                Cols = 6,
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
            new FieldSchema
            {
                Type = "date",
                Name = "dateEntree",
                Label = "Client depuis le",
                Cols = 6,
                Validators = [new ValidatorSchema { Type = "required" }],
            },
            new FieldSchema
            {
                Type = "select",
                Name = "segment",
                Label = "Segment",
                Cols = 6,
                Options =
                [
                    new OptionSchema { Value = "vip", Label = "VIP" },
                    new OptionSchema { Value = "standard", Label = "Standard" },
                    new OptionSchema { Value = "prospect", Label = "Prospect" },
                ],
            },

            // --- Sous-formulaire : FormGroup imbriqué ---
            new FieldSchema
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
                        Cols = 12,
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
                        // Autocomplete alimenté par la ressource « clients » : à la sélection d'un
                        // client, sa ville auto-remplit le champ « ville » ci-dessus (via Fill).
                        Type = "autocomplete",
                        Name = "rattachement",
                        Label = "Rattaché au client",
                        Placeholder = "Tapez pour rechercher un client…",
                        Hint = "Choisir un client remplit automatiquement la ville.",
                        ResourceId = "clients",
                        Fill = [new FillRuleSchema { From = "ville", To = "adresse.ville" }],
                        Cols = 12,
                    },
                ],
            },

            // --- Liste répétable : FormArray de FormGroup ---
            new FieldSchema
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

            new FieldSchema
            {
                Type = "textarea",
                Name = "notes",
                Label = "Notes internes",
                Cols = 12,
                Validators = [new ValidatorSchema { Type = "maxLength", Value = 500 }],
            },
        ],
    };

    /// <summary>Formulaire court, pour vérifier que le moteur marche sur un schéma trivial.</summary>
    private static FormSchema BuildContactForm() => new()
    {
        Id = "contact",
        Title = "Demande de contact",
        Description = "Formulaire simple, sans imbrication.",
        SubmitLabel = "Envoyer",
        Fields =
        [
            new FieldSchema
            {
                Type = "text",
                Name = "nom",
                Label = "Votre nom",
                Cols = 6,
                Validators = [new ValidatorSchema { Type = "required" }],
            },
            new FieldSchema
            {
                Type = "email",
                Name = "email",
                Label = "Votre email",
                Cols = 6,
                Validators =
                [
                    new ValidatorSchema { Type = "required" },
                    new ValidatorSchema { Type = "email" },
                ],
            },
            new FieldSchema
            {
                Type = "select",
                Name = "sujet",
                Label = "Sujet",
                Cols = 12,
                Validators = [new ValidatorSchema { Type = "required" }],
                Options =
                [
                    new OptionSchema { Value = "commercial", Label = "Question commerciale" },
                    new OptionSchema { Value = "support", Label = "Support technique" },
                    new OptionSchema { Value = "autre", Label = "Autre" },
                ],
            },
            new FieldSchema
            {
                Type = "textarea",
                Name = "message",
                Label = "Message",
                Cols = 12,
                Validators =
                [
                    new ValidatorSchema { Type = "required" },
                    new ValidatorSchema { Type = "minLength", Value = 10 },
                ],
            },
        ],
    };
}
