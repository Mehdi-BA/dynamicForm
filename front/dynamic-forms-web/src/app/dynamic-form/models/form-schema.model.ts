/**
 * Types du schéma de formulaire — miroir de DynamicForms.Api.Models côté back.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'email'
  | 'password'
  | 'select'
  | 'autocomplete'
  | 'date'
  | 'checkbox'
  | 'radio'
  | 'group'
  | 'array';

export interface FormSchema {
  id: string;
  title: string;
  description?: string;
  submitLabel?: string;
  fields: FieldSchema[];
  dataSources?: DataSourceDefinition[];
}

export interface FieldSchema {
  type: FieldType;
  name: string;
  label?: string;
  placeholder?: string;
  hint?: string;
  defaultValue?: unknown;
  disabled?: boolean;

  /** Largeur du champ sur une grille de 12 colonnes. */
  cols?: number;

  validators?: ValidatorSchema[];

  /** Options statiques : select, radio. */
  options?: OptionSchema[];

  /** Clé de lookup distant pour les champs autocomplete. */
  lookupSource?: string;

  /** Identifiant d'une source de données déclarée au niveau du formulaire. */
  dataSourceId?: string;

  /** URL de recherche pour un autocomplete distant (ex: /api/referentials/pays/search). */
  lookupUrl?: string;

  /** Nom de la propriété qui contient la clé dans la réponse API (ex: key, id, code). */
  lookupKeyField?: string;

  /** Nom de la propriété qui contient le libellé dans la réponse API (ex: value, label, name). */
  lookupValueField?: string;

  /** Nom du paramètre query string utilisé pour la recherche (par défaut: q). */
  lookupQueryParam?: string;

  /**
   * Mapping de champs à remplir depuis le résultat sélectionné.
   * Exemple: sourceField="address.city" -> targetField="adresse.ville".
   */
  resultMappings?: ResultMappingSchema[];

  /** Condition d'affichage. Un champ masqué est désactivé : hors valeur, hors validation. */
  visibleIf?: ConditionSchema;

  /** Sous-champs, pour type = 'group' ou 'array'. */
  fields?: FieldSchema[];

  /** type = 'array' : libellé du bouton d'ajout. */
  addLabel?: string;

  /** type = 'array' : nombre de lignes créées à l'initialisation. */
  initialItems?: number;
}

export interface ValidatorSchema {
  /** Clé du registre : natif (required, email, min…) ou custom (matriculeFiscal…). */
  type: string;
  /** Argument du validateur : 5 pour min, une regex pour pattern. */
  value?: unknown;
  /** Message affiché en cas d'échec. À défaut, message par défaut du registre. */
  message?: string;
}

/**
 * Condition déclarative : soit une feuille (field/op/value), soit un noeud logique (and/or).
 * Volontairement pas d'expression JS à évaluer.
 */
export interface ConditionSchema {
  /** Chemin du champ observé, relatif à la racine du formulaire (ex: 'adresse.pays'). */
  field?: string;
  op?: ConditionOp;
  value?: unknown;
  and?: ConditionSchema[];
  or?: ConditionSchema[];
}

export type ConditionOp =
  | 'eq'
  | 'neq'
  | 'in'
  | 'notIn'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'truthy'
  | 'falsy';

export interface OptionSchema {
  value: unknown;
  label: string;
  /** Données additionnelles d'une option select, réutilisables dans resultMappings. */
  data?: Record<string, unknown>;
}

export interface ResultMappingSchema {
  /** Chemin de la valeur dans l'objet résultat sélectionné (value, label, data.code...). */
  sourceField: string;
  /** Chemin du contrôle cible dans le formulaire (notation pointée). */
  targetField: string;
}

export interface DataSourceDefinition {
  id: string;
  label: string;
  url: string;
  queryParam?: string;
  valueField: string;
  displayField: string;
  availableFields?: DataSourceFieldDefinition[];
}

export interface DataSourceFieldDefinition {
  path: string;
  label: string;
}
