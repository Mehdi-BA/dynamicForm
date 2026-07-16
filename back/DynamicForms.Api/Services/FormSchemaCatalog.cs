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
/// Les formulaires d'exemple ne déclarent plus leurs champs : ils les <b>composent</b> depuis
/// la <see cref="FieldLibrary"/>, exactement comme le fait un utilisateur dans le builder.
/// Un champ « email » n'est donc défini qu'à un seul endroit.
///
/// Le dictionnaire est accédé en concurrence par les requêtes HTTP (le service est
/// singleton), d'où le ConcurrentDictionary.
/// </summary>
public sealed class FormSchemaCatalog
{
    private readonly ConcurrentDictionary<string, FormSchema> _schemas;
    private readonly FieldLibrary _library;

    public FormSchemaCatalog(FieldLibrary library)
    {
        _library = library;
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

    // -------------------------------------------------------------------------
    // Composition : copier un champ de la bibliothèque, puis le contextualiser
    // -------------------------------------------------------------------------

    /// <summary>
    /// Un champ de la bibliothèque, posé dans ce formulaire. `cols`, `visibleIf` et `label`
    /// sont contextuels : ils dépendent du formulaire d'accueil, pas du champ — c'est
    /// précisément ce que règle l'utilisateur dans le builder après avoir cliqué la palette.
    /// </summary>
    private FieldSchema Field(
        string id,
        int cols = 12,
        ConditionSchema? visibleIf = null,
        string? label = null)
    {
        var field = _library.Copy(id);

        field.Cols = cols;
        field.VisibleIf = visibleIf;

        if (label is not null)
            field.Label = label;

        return field;
    }

    /// <summary>Condition « ce champ vaut cette valeur ».</summary>
    private static ConditionSchema Eq(string field, object value) =>
        new() { Field = field, Op = "eq", Value = value };

    /// <summary>Condition « ce champ est renseigné / coché ».</summary>
    private static ConditionSchema Truthy(string field) =>
        new() { Field = field, Op = "truthy" };

    /// <summary>Toutes les sous-conditions doivent être vraies.</summary>
    private static ConditionSchema And(params ConditionSchema[] conditions) =>
        new() { And = [.. conditions] };

    // -------------------------------------------------------------------------
    // Les formulaires d'exemple
    // -------------------------------------------------------------------------

    /// <summary>
    /// Fiche client : exerce le conditionnel (visibleIf), le sous-formulaire (group),
    /// la liste répétable (array), l'autocomplete distant et un validateur custom.
    /// </summary>
    private FormSchema BuildClientForm() => new()
    {
        Id = "client",
        Title = "Fiche client",
        Description = "Formulaire complet : champs conditionnels, sous-formulaire adresse, liste de contacts.",
        SubmitLabel = "Enregistrer le client",
        DataSources =
        [
            new DataSourceDefinition
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
            // Source « riche » : chaque résultat porte plusieurs champs, ce qui permet
            // à l'autocomplete « rattachement » d'auto-remplir la ville à la sélection
            // d'un client (voir les ResultMappings du champ, dans la bibliothèque).
            new DataSourceDefinition
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
        ],
        Fields =
        [
            Field("clientType"),

            // --- Bloc particulier : visible seulement si clientType == "particulier" ---
            Field("prenom", cols: 6, visibleIf: Eq("clientType", "particulier")),
            Field("nom", cols: 6, visibleIf: Eq("clientType", "particulier")),

            // --- Bloc professionnel : visible seulement si clientType == "pro" ---
            Field("raisonSociale", cols: 6, visibleIf: Eq("clientType", "pro")),
            Field("matriculeFiscal", cols: 6, visibleIf: Eq("clientType", "pro")),
            Field("assujettiTva", cols: 6, visibleIf: Eq("clientType", "pro")),
            // Condition composée : pro ET assujetti.
            Field("tauxTva", cols: 6, visibleIf: And(Eq("clientType", "pro"), Truthy("assujettiTva"))),

            // --- Champs communs ---
            Field("email", cols: 6),
            Field("telephone", cols: 6),
            Field("dateEntree", cols: 6),
            Field("segment", cols: 6),

            // Sous-formulaire (FormGroup imbriqué) et liste répétable (FormArray) : le bloc
            // entier vient de la bibliothèque, sous-champs compris.
            Field("adresse"),
            Field("contacts"),

            Field("rattachement"),
            Field("notes", label: "Notes internes"),
        ],
    };

    /// <summary>Formulaire court, pour vérifier que le moteur marche sur un schéma trivial.</summary>
    private FormSchema BuildContactForm() => new()
    {
        Id = "contact",
        Title = "Demande de contact",
        Description = "Formulaire simple, sans imbrication.",
        SubmitLabel = "Envoyer",
        Fields =
        [
            // Le libellé est contextuel : « Votre nom » ici, « Nom » sur la fiche client.
            Field("nom", cols: 6, label: "Votre nom"),
            Field("email", cols: 6, label: "Votre email"),
            Field("sujet"),
            Field("message"),
        ],
    };
}
