import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSliderModule } from '@angular/material/slider';
import {
  ConditionOp,
  ConditionSchema,
  FieldSchema,
  FieldType,
  OptionSchema,
  ResultMappingSchema,
  ValidatorSchema,
} from '../../dynamic-form/models/form-schema.model';
import { BuilderStateService, FIELD_TYPES, FieldPath } from '../services/builder-state.service';

/** Les validateurs proposés dans le panneau, et s'ils prennent un argument. */
interface ValidatorInfo {
  type: string;
  label: string;
  /** Le validateur prend une valeur (min: 5) plutôt qu'un simple oui/non. */
  arg?: 'number' | 'text';
  /** Types de champs pour lesquels ce validateur a du sens. */
  appliesTo?: FieldType[];
}

const VALIDATORS: ValidatorInfo[] = [
  { type: 'required', label: 'Obligatoire' },
  { type: 'email', label: 'Email valide', appliesTo: ['text', 'email'] },
  { type: 'minLength', label: 'Longueur min.', arg: 'number', appliesTo: ['text', 'textarea', 'password'] },
  { type: 'maxLength', label: 'Longueur max.', arg: 'number', appliesTo: ['text', 'textarea', 'password'] },
  { type: 'min', label: 'Valeur min.', arg: 'number', appliesTo: ['number'] },
  { type: 'max', label: 'Valeur max.', arg: 'number', appliesTo: ['number'] },
  { type: 'pattern', label: 'Expression régulière', arg: 'text', appliesTo: ['text', 'textarea', 'password'] },
  { type: 'requiredTrue', label: 'Doit être cochée', appliesTo: ['checkbox'] },
  // Validateurs custom du registre — le back n'en connaît que la clé.
  { type: 'matriculeFiscal', label: 'Matricule fiscal (custom)', appliesTo: ['text'] },
  { type: 'noSurroundingSpace', label: 'Sans espaces autour (custom)', appliesTo: ['text', 'password'] },
];

const OPERATORS: { op: ConditionOp; label: string; needsValue: boolean }[] = [
  { op: 'eq', label: 'est égal à', needsValue: true },
  { op: 'neq', label: "n'est pas égal à", needsValue: true },
  { op: 'gt', label: 'est supérieur à', needsValue: true },
  { op: 'gte', label: 'est supérieur ou égal à', needsValue: true },
  { op: 'lt', label: 'est inférieur à', needsValue: true },
  { op: 'lte', label: 'est inférieur ou égal à', needsValue: true },
  { op: 'truthy', label: 'est renseigné / coché', needsValue: false },
  { op: 'falsy', label: 'est vide / décoché', needsValue: false },
];

/**
 * Panneau d'édition du champ sélectionné.
 *
 * Chaque modification est écrite immédiatement dans le state (pas de bouton « appliquer ») :
 * l'aperçu se met à jour en direct, ce qui est tout l'intérêt d'un builder visuel.
 */
@Component({
  selector: 'app-field-properties',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatSliderModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './field-properties.component.html',
  styleUrl: './field-properties.component.scss',
})
export class FieldPropertiesComponent {
  readonly path = input.required<FieldPath>();
  readonly field = input.required<FieldSchema>();

  /** Sources de lookup proposées pour les champs autocomplete. */
  readonly lookupSources = input<string[]>([]);

  private readonly state = inject(BuilderStateService);

  readonly fieldTypes = FIELD_TYPES;
  readonly operators = OPERATORS;

  readonly isContainer = computed(() => {
    const t = this.field().type;
    return t === 'group' || t === 'array';
  });

  readonly hasOptions = computed(() => {
    const t = this.field().type;
    return t === 'select' || t === 'radio';
  });

  readonly canMapResult = computed(() => {
    const t = this.field().type;
    return t === 'select' || t === 'autocomplete';
  });

  /** Les validateurs pertinents pour le type courant. */
  readonly availableValidators = computed(() => {
    const type = this.field().type;
    return VALIDATORS.filter((v) => !v.appliesTo || v.appliesTo.includes(type));
  });

  /**
   * Les champs que la condition peut cibler : tous, sauf le champ lui-même et ses
   * descendants (une condition circulaire ne se résoudrait jamais).
   */
  readonly conditionTargets = computed(() => {
    const paths: { path: string; label: string }[] = [];
    const selfPath = this.path();

    const walk = (fields: FieldSchema[], prefix: string, at: FieldPath) => {
      fields.forEach((f, i) => {
        const here = [...at, i];
        const dotted = prefix ? `${prefix}.${f.name}` : f.name;

        // Exclure le champ courant et tout ce qu'il contient.
        const isSelfOrDescendant =
          here.length >= selfPath.length && selfPath.every((v, k) => v === here[k]);

        if (!isSelfOrDescendant && f.type !== 'group' && f.type !== 'array') {
          paths.push({ path: dotted, label: `${f.label || f.name} (${dotted})` });
        }

        if (f.fields?.length) {
          walk(f.fields, dotted, here);
        }
      });
    };

    walk(this.state.schema().fields, '', []);
    return paths;
  });

  readonly resultMappings = computed<ResultMappingSchema[]>(() => this.field().resultMappings ?? []);

  // ---------------------------------------------------------------------------
  // Propriétés simples
  // ---------------------------------------------------------------------------

  patch(patch: Partial<FieldSchema>): void {
    this.state.patchField(this.path(), patch);
  }

  onTypeChange(type: FieldType): void {
    this.patch({ type });
  }

  setLookupUrl(url: string): void {
    const trimmed = url.trim();

    this.patch({
      lookupUrl: trimmed || undefined,
      lookupKeyField: this.field().lookupKeyField || (trimmed ? 'key' : undefined),
      lookupValueField: this.field().lookupValueField || (trimmed ? 'value' : undefined),
      lookupQueryParam: this.field().lookupQueryParam || (trimmed ? 'q' : undefined),
    });
  }

  // ---------------------------------------------------------------------------
  // Validateurs
  // ---------------------------------------------------------------------------

  hasValidator(type: string): boolean {
    return !!this.field().validators?.some((v) => v.type === type);
  }

  validatorValue(type: string): unknown {
    return this.field().validators?.find((v) => v.type === type)?.value ?? '';
  }

  toggleValidator(type: string, on: boolean): void {
    const current = [...(this.field().validators ?? [])];

    if (on) {
      if (!current.some((v) => v.type === type)) {
        current.push({ type });
      }
    } else {
      const i = current.findIndex((v) => v.type === type);
      if (i >= 0) {
        current.splice(i, 1);
      }
    }

    this.patch({ validators: current });
  }

  setValidatorValue(type: string, value: string): void {
    const current = [...(this.field().validators ?? [])];
    const i = current.findIndex((v) => v.type === type);

    if (i < 0) {
      return;
    }

    const info = VALIDATORS.find((v) => v.type === type);
    const parsed: ValidatorSchema = {
      ...current[i],
      value: info?.arg === 'number' ? Number(value) : value,
    };

    current[i] = parsed;
    this.patch({ validators: current });
  }

  // ---------------------------------------------------------------------------
  // Options (select / radio)
  // ---------------------------------------------------------------------------

  addOption(): void {
    const options = [...(this.field().options ?? [])];
    const n = options.length + 1;
    options.push({ value: `option${n}`, label: `Option ${n}` });
    this.patch({ options });
  }

  updateOption(index: number, patch: Partial<OptionSchema>): void {
    const options = [...(this.field().options ?? [])];
    if (!options[index]) {
      return;
    }
    options[index] = { ...options[index], ...patch };
    this.patch({ options });
  }

  removeOption(index: number): void {
    const options = [...(this.field().options ?? [])];
    options.splice(index, 1);
    this.patch({ options });
  }

  // ---------------------------------------------------------------------------
  // Mapping de résultat (autocomplete/select -> autres champs)
  // ---------------------------------------------------------------------------

  addResultMapping(): void {
    const firstTarget = this.conditionTargets()[0]?.path;

    const mappings = [...this.resultMappings()];
    mappings.push({ sourceField: 'value', targetField: firstTarget ?? '' });

    this.patch({ resultMappings: mappings });
  }

  updateResultMapping(index: number, patch: Partial<ResultMappingSchema>): void {
    const mappings = [...this.resultMappings()];

    if (!mappings[index]) {
      return;
    }

    mappings[index] = { ...mappings[index], ...patch };
    this.patch({ resultMappings: mappings });
  }

  removeResultMapping(index: number): void {
    const mappings = [...this.resultMappings()];
    mappings.splice(index, 1);
    this.patch({ resultMappings: mappings.length ? mappings : undefined });
  }

  // ---------------------------------------------------------------------------
  // Condition d'affichage
  //
  // Le schéma autorise une feuille simple (`{field, op, value}`) ou un noeud logique
  // (`{and: [...]}` / `{or: [...]}`). L'éditeur présente les deux formes de la même
  // façon — une liste de règles + un mode ET/OU — et reconstruit la bonne forme à
  // l'écriture. Sans ça, ouvrir un champ qui porte déjà un `and` l'écraserait.
  // ---------------------------------------------------------------------------

  readonly conditionEnabled = computed(() => !!this.field().visibleIf);

  /** Les règles, quelle que soit la forme du schéma. */
  readonly conditionRules = computed<ConditionSchema[]>(() => {
    const cond = this.field().visibleIf;

    if (!cond) {
      return [];
    }

    if (cond.and?.length) return cond.and;
    if (cond.or?.length) return cond.or;

    return [cond];
  });

  readonly conditionMode = computed<'and' | 'or'>(() =>
    this.field().visibleIf?.or?.length ? 'or' : 'and',
  );

  toggleCondition(on: boolean): void {
    if (!on) {
      this.patch({ visibleIf: undefined });
      return;
    }

    const first = this.conditionTargets()[0];
    if (!first) {
      return;
    }

    this.writeRules([{ field: first.path, op: 'eq', value: '' }], this.conditionMode());
  }

  setMode(mode: 'and' | 'or'): void {
    this.writeRules(this.conditionRules(), mode);
  }

  addRule(): void {
    const first = this.conditionTargets()[0];
    if (!first) {
      return;
    }

    this.writeRules(
      [...this.conditionRules(), { field: first.path, op: 'eq', value: '' }],
      this.conditionMode(),
    );
  }

  removeRule(index: number): void {
    const rules = [...this.conditionRules()];
    rules.splice(index, 1);

    // Plus aucune règle : le champ redevient inconditionnel plutôt que de porter
    // un `and: []`, que l'évaluateur traiterait comme « toujours visible » de toute façon.
    if (rules.length === 0) {
      this.patch({ visibleIf: undefined });
      return;
    }

    this.writeRules(rules, this.conditionMode());
  }

  setRule(index: number, patch: Partial<ConditionSchema>): void {
    const rules = this.conditionRules().map((r, i) => (i === index ? { ...r, ...patch } : r));
    this.writeRules(rules, this.conditionMode());
  }

  /** L'opérateur de cette règle attend-il une valeur de comparaison ? */
  ruleNeedsValue(rule: ConditionSchema): boolean {
    return OPERATORS.find((o) => o.op === rule.op)?.needsValue ?? false;
  }

  /**
   * Écrit les règles sous la forme la plus simple qui les représente : une règle seule
   * devient une feuille, plusieurs deviennent un `and`/`or`. Le schéma reste lisible.
   */
  private writeRules(rules: ConditionSchema[], mode: 'and' | 'or'): void {
    if (rules.length === 0) {
      this.patch({ visibleIf: undefined });
      return;
    }

    if (rules.length === 1) {
      this.patch({ visibleIf: { ...rules[0] } });
      return;
    }

    this.patch({ visibleIf: mode === 'or' ? { or: rules } : { and: rules } });
  }
}
