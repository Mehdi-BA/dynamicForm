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

  /** Autocomplete : id de la ressource (data source) exécutée par le moteur pour lister les options. */
  resourceId?: string;

  /** Autocomplete : règles d'auto-remplissage déclenchées à la sélection d'une option. */
  fill?: FillRule[];

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
}

/**
 * Une « ressource » (data source) : la description déclarative d'un appel d'API que le
 * moteur exécute côté front pour alimenter un champ autocomplete.
 */
export interface Resource {
  id: string;
  name: string;
  url: string;
  method?: string;
  params?: ResourceParam[];
  mapping: ResourceMapping;
}

export interface ResourceParam {
  name: string;
  /** Valeur par défaut ; le paramètre nommé `q` reçoit plutôt la saisie utilisateur. */
  defaultValue?: string;
}

/** Comment transformer une ligne de la réponse JSON en option {value, label, extra}. */
export interface ResourceMapping {
  valueField: string;
  labelField: string;
  /** Champs additionnels conservés sur l'option, pour l'auto-remplissage. */
  extraFields?: string[];
}

/**
 * Règle d'auto-remplissage : à la sélection d'une option, la valeur du champ extra `from`
 * de l'option est écrite dans le champ du formulaire désigné par `to` (chemin pointé).
 */
export interface FillRule {
  /** Clé d'un champ extra de la ressource (ex: 'ville'). */
  from: string;
  /** Chemin du champ du formulaire à remplir (ex: 'adresse.ville'). */
  to: string;
}

/** Une option d'autocomplete, produite par l'exécution d'une ressource. */
export interface ResourceOption {
  value: string;
  label: string;
  extra: Record<string, unknown>;
}
