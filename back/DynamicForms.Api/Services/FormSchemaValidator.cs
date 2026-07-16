using DynamicForms.Api.Models;

namespace DynamicForms.Api.Services;

/// <summary>
/// Valide un schéma produit par le form builder avant de l'accepter.
///
/// Sans ça, un schéma incohérent (nom de champ dupliqué, `group` sans enfants, condition
/// pointant vers un champ inexistant) serait accepté puis ferait échouer le moteur côté
/// front, là où l'erreur est bien plus difficile à diagnostiquer.
/// </summary>
public sealed class FormSchemaValidator
{
    private static readonly HashSet<string> KnownTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        "text", "textarea", "number", "email", "password", "select",
        "autocomplete", "date", "checkbox", "radio", "group", "array",
    };

    private static readonly HashSet<string> KnownOps = new(StringComparer.OrdinalIgnoreCase)
    {
        "eq", "neq", "in", "notIn", "gt", "gte", "lt", "lte", "truthy", "falsy",
    };

    public IReadOnlyList<string> Validate(FormSchema schema)
    {
        var errors = new List<string>();
        var dataSources = schema.DataSources ?? [];
        var dataSourceIds = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        if (string.IsNullOrWhiteSpace(schema.Id))
            errors.Add("L'identifiant du formulaire est obligatoire.");

        if (string.IsNullOrWhiteSpace(schema.Title))
            errors.Add("Le titre du formulaire est obligatoire.");

        if (schema.Fields.Count == 0)
            errors.Add("Le formulaire doit contenir au moins un champ.");

        foreach (var source in dataSources)
        {
            if (string.IsNullOrWhiteSpace(source.Id))
            {
                errors.Add("Une source de données sans identifiant a été trouvée.");
                continue;
            }

            if (!dataSourceIds.Add(source.Id))
                errors.Add($"La source de données « {source.Id} » est définie plusieurs fois.");

            if (string.IsNullOrWhiteSpace(source.Label))
                errors.Add($"La source de données « {source.Id} » doit avoir un libellé.");

            if (string.IsNullOrWhiteSpace(source.Url))
                errors.Add($"La source de données « {source.Id} » doit avoir une URL.");

            if (string.IsNullOrWhiteSpace(source.ValueField))
                errors.Add($"La source de données « {source.Id} » doit définir valueField.");

            if (string.IsNullOrWhiteSpace(source.DisplayField))
                errors.Add($"La source de données « {source.Id} » doit définir displayField.");
        }

        // Les chemins valides pour les conditions : tous les champs du formulaire,
        // en notation pointée ("adresse.pays").
        var paths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        CollectPaths(schema.Fields, prefix: "", paths);

        ValidateFields(schema.Fields, path: "", paths, dataSourceIds, errors);

        return errors;
    }

    private void ValidateFields(
        List<FieldSchema> fields,
        string path,
        HashSet<string> knownPaths,
        HashSet<string> dataSourceIds,
        List<string> errors)
    {
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        foreach (var field in fields)
        {
            var here = string.IsNullOrEmpty(path) ? field.Name : $"{path}.{field.Name}";

            if (string.IsNullOrWhiteSpace(field.Name))
            {
                errors.Add($"Un champ sans nom a été trouvé{(path == "" ? "" : $" dans « {path} »")}.");
                continue;
            }

            if (!seen.Add(field.Name))
                errors.Add($"Le nom de champ « {here} » est utilisé deux fois au même niveau.");

            if (!KnownTypes.Contains(field.Type))
                errors.Add($"Le champ « {here} » a un type inconnu : « {field.Type} ».");

            // Un conteneur sans enfants ne rend rien : c'est presque toujours un oubli.
            if (field.Type is "group" or "array")
            {
                if (field.Fields is null || field.Fields.Count == 0)
                {
                    errors.Add($"Le champ « {here} » est de type « {field.Type} » mais n'a aucun sous-champ.");
                }
                else
                {
                    ValidateFields(field.Fields, here, knownPaths, dataSourceIds, errors);
                }
            }

            // Un select/radio sans options et sans datasource est un champ que l'utilisateur ne peut pas remplir.
            if (field.Type is "select" or "radio" && string.IsNullOrWhiteSpace(field.DataSourceId) && (field.Options is null || field.Options.Count == 0))
                errors.Add($"Le champ « {here} » est de type « {field.Type} » mais n'a aucune option.");

            if (!string.IsNullOrWhiteSpace(field.DataSourceId) && !dataSourceIds.Contains(field.DataSourceId))
                errors.Add($"Le champ « {here} » référence la source de données inconnue « {field.DataSourceId} ».");

            if (field.Type == "autocomplete")
            {
                var hasDataSource = !string.IsNullOrWhiteSpace(field.DataSourceId);
                var hasLookupSource = !string.IsNullOrWhiteSpace(field.LookupSource);
                var hasLookupUrl = !string.IsNullOrWhiteSpace(field.LookupUrl);

                if (!hasDataSource && !hasLookupSource && !hasLookupUrl)
                {
                    errors.Add($"Le champ « {here} » est de type « autocomplete » mais n'a ni dataSource, ni source, ni URL.");
                }

                if (hasLookupUrl && !hasDataSource)
                {
                    if (string.IsNullOrWhiteSpace(field.LookupKeyField))
                        errors.Add($"Le champ « {here} » définit lookupUrl mais pas lookupKeyField.");

                    if (string.IsNullOrWhiteSpace(field.LookupValueField))
                        errors.Add($"Le champ « {here} » définit lookupUrl mais pas lookupValueField.");
                }
            }

            if (field.ResultMappings is { Count: > 0 })
            {
                if (field.Type is not "autocomplete" and not "select")
                {
                    errors.Add($"Le champ « {here} » définit resultMappings mais son type ne le supporte pas.");
                }

                foreach (var mapping in field.ResultMappings)
                {
                    if (string.IsNullOrWhiteSpace(mapping.SourceField))
                        errors.Add($"Le champ « {here} » a un mapping sans sourceField.");

                    if (string.IsNullOrWhiteSpace(mapping.TargetField))
                    {
                        errors.Add($"Le champ « {here} » a un mapping sans targetField.");
                        continue;
                    }

                    if (!knownPaths.Contains(mapping.TargetField))
                        errors.Add($"Le mapping du champ « {here} » cible « {mapping.TargetField} », qui n'existe pas.");

                    if (string.Equals(mapping.TargetField, here, StringComparison.OrdinalIgnoreCase))
                        errors.Add($"Le mapping du champ « {here} » ne peut pas cibler le champ lui-même.");
                }
            }

            ValidateCondition(field.VisibleIf, here, knownPaths, errors);
        }
    }

    private void ValidateCondition(
        ConditionSchema? condition,
        string fieldPath,
        HashSet<string> knownPaths,
        List<string> errors)
    {
        if (condition is null)
            return;

        if (condition.And is not null)
        {
            foreach (var c in condition.And)
                ValidateCondition(c, fieldPath, knownPaths, errors);
            return;
        }

        if (condition.Or is not null)
        {
            foreach (var c in condition.Or)
                ValidateCondition(c, fieldPath, knownPaths, errors);
            return;
        }

        if (string.IsNullOrWhiteSpace(condition.Field))
        {
            errors.Add($"La condition du champ « {fieldPath} » ne désigne aucun champ.");
            return;
        }

        // Une condition qui pointe vers un champ inexistant ne se déclenchera jamais :
        // le champ resterait masqué pour toujours, sans aucun message d'erreur.
        if (!knownPaths.Contains(condition.Field))
            errors.Add($"La condition du champ « {fieldPath} » cible « {condition.Field} », qui n'existe pas.");

        if (condition.Field == fieldPath)
            errors.Add($"Le champ « {fieldPath} » a une condition qui dépend de lui-même.");

        if (!string.IsNullOrWhiteSpace(condition.Op) && !KnownOps.Contains(condition.Op))
            errors.Add($"La condition du champ « {fieldPath} » utilise un opérateur inconnu : « {condition.Op} ».");
    }

    /// <summary>Collecte tous les chemins de champs, y compris dans les group/array.</summary>
    private static void CollectPaths(List<FieldSchema> fields, string prefix, HashSet<string> into)
    {
        foreach (var field in fields)
        {
            if (string.IsNullOrWhiteSpace(field.Name))
                continue;

            var path = string.IsNullOrEmpty(prefix) ? field.Name : $"{prefix}.{field.Name}";
            into.Add(path);

            if (field.Fields is { Count: > 0 })
                CollectPaths(field.Fields, path, into);
        }
    }
}
