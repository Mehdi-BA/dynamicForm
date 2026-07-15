# Dynamic Forms

Moteur de formulaires dynamiques : un schéma JSON servi par l'API décrit le formulaire,
Angular le construit et le rend. Le front ne connaît aucun champ métier.

Deux écrans :
- **`/`** — la démo : choisit un formulaire, le rend, l'envoie au back.
- **`/builder`** — le form builder : construit le schéma à la souris, avec aperçu en direct.

```
DynamicForms/
├── back/          .NET 9 — Web API, sert et valide les schémas
└── front/         Angular 21 + Angular Material — le moteur et le builder
```

## Démarrer

```bash
# Terminal 1 — API sur http://localhost:5244
cd back && dotnet run --project DynamicForms.Api

# Terminal 2 — front sur http://localhost:4200
cd front/dynamic-forms-web && npx ng serve
```

> Angular 21 (et non 22) : la 22 exige Node ≥ 22.22.3.

## API

| Route | Rôle |
|---|---|
| `GET /api/forms` | Liste des formulaires (id, titre) |
| `GET /api/forms/{id}` | Schéma complet — ce que le moteur consomme |
| `PUT /api/forms/{id}` | Crée ou remplace un schéma — ce qu'appelle le builder |
| `DELETE /api/forms/{id}` | Supprime un schéma |
| `POST /api/forms/{id}/submit` | Réception des données (echo, pas de persistance) |
| `GET /api/lookup` | Sources de lookup disponibles |
| `GET /api/lookup/{source}?q=` | Recherche pour les champs `autocomplete` |

Deux formulaires d'exemple : `client` (exerce tout le moteur) et `contact` (schéma trivial).
Les schémas créés par le builder vivent en mémoire : ils sont perdus au redémarrage de l'API.

Un schéma envoyé au back est **validé avant d'être accepté** (`FormSchemaValidator`) :
noms de champs dupliqués, conteneur vide, `select` sans options, condition ciblant un
champ inexistant… Un schéma incohérent casserait le moteur côté front, là où l'erreur est
bien plus difficile à diagnostiquer.

## Le form builder

Trois colonnes — palette, arbre des champs, propriétés — et trois onglets : **Structure**
(l'arbre, réordonnable au drag & drop), **Aperçu** (le formulaire réel, rendu par le même
moteur que la démo), **JSON** (le schéma produit).

On peut partir d'un formulaire existant pour le modifier, ou de zéro. « Enregistrer »
envoie le schéma au back, qui le valide et le sert immédiatement à la démo.

Code dans `front/dynamic-forms-web/src/app/form-builder/` :

| Fichier | Rôle |
|---|---|
| `services/builder-state.service.ts` | L'arbre en cours de construction. Un champ est désigné par son **chemin** (`[2, 0]` = 1er sous-champ du 3e champ) |
| `components/field-tree.component.ts` | L'arbre, **récursif** comme le moteur ; chaque niveau est sa propre zone de drop |
| `components/field-properties.component.ts` | Le panneau du champ sélectionné : type, validateurs, options, condition |

## Le moteur

Trois briques, dans `front/dynamic-forms-web/src/app/dynamic-form/` :

| Fichier | Rôle |
|---|---|
| `services/dynamic-form-builder.service.ts` | Schéma JSON → arbre de `FormGroup` / `FormArray` / `FormControl`, récursivement |
| `services/validator-registry.service.ts` | Résout `{"type": "required"}` en `Validators.required` — et les validateurs custom par clé |
| `services/condition-evaluator.service.ts` | Évalue les `visibleIf` contre la valeur du formulaire |
| `components/dynamic-field.component.ts` | Rend un champ ; **s'appelle lui-même** pour `group` et `array` |
| `components/dynamic-form.component.ts` | Composant public : `<app-dynamic-form [schema]="…" (submitted)="…" />` |

La récursivité de `DynamicFieldComponent` est ce qui donne les sous-formulaires et les
listes imbriquées à profondeur quelconque, sans code spécifique par niveau.

## Le schéma

```jsonc
{
  "id": "client",
  "title": "Fiche client",
  "fields": [
    {
      "type": "radio",                    // text|textarea|number|email|password|select|
      "name": "clientType",               // autocomplete|date|checkbox|radio|group|array
      "label": "Type de client",
      "defaultValue": "particulier",
      "cols": 6,                          // largeur sur une grille de 12
      "validators": [{ "type": "required" }],
      "options": [
        { "value": "particulier", "label": "Particulier" },
        { "value": "pro", "label": "Professionnel" }
      ]
    },
    {
      "type": "text",
      "name": "matriculeFiscal",
      "validators": [
        { "type": "required" },
        { "type": "matriculeFiscal", "message": "Matricule fiscal invalide" }
      ],
      "visibleIf": { "field": "clientType", "op": "eq", "value": "pro" }
    },
    {
      "type": "group",                    // sous-formulaire → FormGroup imbriqué
      "name": "adresse",
      "fields": [ /* … champs, récursivement … */ ]
    },
    {
      "type": "array",                    // liste répétable → FormArray de FormGroup
      "name": "contacts",
      "addLabel": "Ajouter un contact",
      "initialItems": 1,
      "fields": [ /* … champs d'une ligne … */ ]
    }
  ]
}
```

### Validateurs

Natifs : `required`, `requiredTrue`, `email`, `min`, `max`, `minLength`, `maxLength`, `pattern`.

Custom : déclarés par clé dans le JSON, implémentés dans le registre. Le back n'a jamais
besoin de connaître le code du validateur.

```ts
// Enregistrer une règle métier
registry.register(
  'iban',
  () => (control) => isValidIban(control.value) ? null : { iban: true },
  'IBAN invalide.',
);
```

Puis dans le schéma : `{ "validators": [{ "type": "iban" }] }`.

### Conditions (`visibleIf`)

La condition est **déclarative**, pas une expression JavaScript : rien d'exécutable ne
transite par l'API, et la condition reste inspectable et testable.

```jsonc
// Feuille
{ "field": "clientType", "op": "eq", "value": "pro" }

// Composée
{ "and": [
    { "field": "clientType", "op": "eq", "value": "pro" },
    { "field": "assujettiTva", "op": "truthy" }
]}
```

Opérateurs : `eq`, `neq`, `in`, `notIn`, `gt`, `gte`, `lt`, `lte`, `truthy`, `falsy`.
Combinateurs : `and`, `or`. Les chemins sont relatifs à la racine (`"adresse.pays"`).

**Un champ masqué est désactivé** : il sort du payload *et* ses validateurs cessent de
bloquer la soumission. Sans ça, un `required` sur un champ invisible rendrait le
formulaire définitivement invalide.

## Utiliser le moteur ailleurs

```html
<app-dynamic-form
  [schema]="schema"
  [value]="valeurExistante"
  (submitted)="enregistrer($event)" />
```

Le dossier `dynamic-form/` est autonome : il ne dépend que d'Angular Material et de
`FormApiService` (à réécrire pour pointer vers votre API).
