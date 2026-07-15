import { computed, Injectable, signal } from '@angular/core';
import { DataSourceDefinition, FieldSchema, FieldType, FormSchema } from '../../dynamic-form/models/form-schema.model';

/**
 * État du form builder : l'arbre de champs en cours de construction.
 *
 * Un champ est désigné par son **chemin** — la suite d'index pour l'atteindre depuis la
 * racine. `[2]` est le 3e champ ; `[2, 0]` est le 1er sous-champ de ce 3e champ.
 * C'est plus robuste qu'un id : après un déplacement, le chemin décrit toujours une
 * position réelle dans l'arbre, alors qu'un id demanderait une recherche récursive.
 */
export type FieldPath = number[];

/** Types proposés dans la palette, avec de quoi les afficher. */
export interface FieldTypeInfo {
  type: FieldType;
  label: string;
  icon: string;
  /** Un conteneur porte des sous-champs. */
  container?: boolean;
}

export const FIELD_TYPES: FieldTypeInfo[] = [
  { type: 'text', label: 'Texte', icon: 'short_text' },
  { type: 'textarea', label: 'Texte long', icon: 'notes' },
  { type: 'number', label: 'Nombre', icon: 'pin' },
  { type: 'email', label: 'Email', icon: 'alternate_email' },
  { type: 'password', label: 'Mot de passe', icon: 'password' },
  { type: 'select', label: 'Liste déroulante', icon: 'arrow_drop_down_circle' },
  { type: 'radio', label: 'Choix unique', icon: 'radio_button_checked' },
  { type: 'checkbox', label: 'Case à cocher', icon: 'check_box' },
  { type: 'date', label: 'Date', icon: 'calendar_today' },
  { type: 'autocomplete', label: 'Autocomplétion', icon: 'search' },
  { type: 'group', label: 'Sous-formulaire', icon: 'folder', container: true },
  { type: 'array', label: 'Liste répétable', icon: 'format_list_numbered', container: true },
];

@Injectable()
export class BuilderStateService {
  private readonly schemaSignal = signal<FormSchema>(this.emptySchema());

  /** Chemin du champ sélectionné, ou null si on édite les propriétés du formulaire. */
  private readonly selectedPathSignal = signal<FieldPath | null>(null);

  readonly schema = this.schemaSignal.asReadonly();
  readonly selectedPath = this.selectedPathSignal.asReadonly();
  readonly dataSources = computed(() => this.schemaSignal().dataSources ?? []);

  /** Le champ actuellement sélectionné, résolu depuis son chemin. */
  readonly selectedField = computed(() => {
    const path = this.selectedPathSignal();
    return path ? this.fieldAt(this.schemaSignal(), path) : null;
  });

  readonly isEmpty = computed(() => this.schemaSignal().fields.length === 0);

  // ---------------------------------------------------------------------------
  // Chargement / remplacement
  // ---------------------------------------------------------------------------

  load(schema: FormSchema): void {
    this.schemaSignal.set(structuredClone(schema));
    this.selectedPathSignal.set(null);
  }

  reset(): void {
    this.schemaSignal.set(this.emptySchema());
    this.selectedPathSignal.set(null);
  }

  /** Met à jour les propriétés du formulaire lui-même (titre, id, description…). */
  patchSchema(patch: Partial<Omit<FormSchema, 'fields'>>): void {
    this.schemaSignal.update((s) => ({ ...s, ...patch }));
  }

  addDataSource(): void {
    const next = structuredClone(this.schemaSignal());
    next.dataSources ??= [];

    const id = this.uniqueDataSourceId('source', next.dataSources);
    next.dataSources.push({
      id,
      label: `Source ${next.dataSources.length + 1}`,
      url: '',
      queryParam: 'q',
      valueField: 'id',
      displayField: 'label',
      availableFields: [],
    });

    this.schemaSignal.set(next);
  }

  updateDataSource(index: number, patch: Partial<DataSourceDefinition>): void {
    const next = structuredClone(this.schemaSignal());
    const source = next.dataSources?.[index];

    if (!source) {
      return;
    }

    Object.assign(source, patch);
    this.schemaSignal.set(next);
  }

  removeDataSource(index: number): void {
    const next = structuredClone(this.schemaSignal());
    const source = next.dataSources?.[index];

    if (!source) {
      return;
    }

    next.dataSources!.splice(index, 1);

    for (const field of this.flattenFields(next.fields)) {
      if (field.dataSourceId === source.id) {
        delete field.dataSourceId;
      }
    }

    if (!next.dataSources!.length) {
      delete next.dataSources;
    }

    this.schemaSignal.set(next);
  }

  // ---------------------------------------------------------------------------
  // Sélection
  // ---------------------------------------------------------------------------

  select(path: FieldPath | null): void {
    this.selectedPathSignal.set(path);
  }

  isSelected(path: FieldPath): boolean {
    return this.pathEquals(this.selectedPathSignal(), path);
  }

  // ---------------------------------------------------------------------------
  // Ajout / suppression / duplication
  // ---------------------------------------------------------------------------

  /**
   * Ajoute un champ. `parentPath` vide = à la racine ; sinon dans le group/array visé.
   * Le nouveau champ est sélectionné, pour qu'on puisse le configurer immédiatement.
   */
  addField(type: FieldType, parentPath: FieldPath = []): void {
    const next = structuredClone(this.schemaSignal());
    const siblings = this.childrenAt(next, parentPath);

    if (!siblings) {
      return;
    }

    const field = this.newField(type, this.uniqueName(type, siblings));
    siblings.push(field);

    this.schemaSignal.set(next);
    this.selectedPathSignal.set([...parentPath, siblings.length - 1]);
  }

  removeField(path: FieldPath): void {
    const next = structuredClone(this.schemaSignal());
    const siblings = this.childrenAt(next, path.slice(0, -1));
    const index = path.at(-1);

    if (!siblings || index === undefined || !siblings[index]) {
      return;
    }

    siblings.splice(index, 1);

    this.schemaSignal.set(next);

    // La sélection pointerait sur un champ qui n'existe plus.
    if (this.pathStartsWith(this.selectedPathSignal(), path)) {
      this.selectedPathSignal.set(null);
    }
  }

  duplicateField(path: FieldPath): void {
    const next = structuredClone(this.schemaSignal());
    const siblings = this.childrenAt(next, path.slice(0, -1));
    const index = path.at(-1);

    if (!siblings || index === undefined || !siblings[index]) {
      return;
    }

    const copy = structuredClone(siblings[index]);
    copy.name = this.uniqueName(copy.name, siblings);
    siblings.splice(index + 1, 0, copy);

    this.schemaSignal.set(next);
    this.selectedPathSignal.set([...path.slice(0, -1), index + 1]);
  }

  // ---------------------------------------------------------------------------
  // Réordonnancement
  // ---------------------------------------------------------------------------

  /** Déplace un champ parmi ses frères. Utilisé par le drag & drop et les flèches. */
  moveField(parentPath: FieldPath, from: number, to: number): void {
    const next = structuredClone(this.schemaSignal());
    const siblings = this.childrenAt(next, parentPath);

    if (!siblings || from === to || !siblings[from]) {
      return;
    }

    const clamped = Math.max(0, Math.min(to, siblings.length - 1));
    const [moved] = siblings.splice(from, 1);
    siblings.splice(clamped, 0, moved);

    this.schemaSignal.set(next);
    this.selectedPathSignal.set([...parentPath, clamped]);
  }

  // ---------------------------------------------------------------------------
  // Édition du champ sélectionné
  // ---------------------------------------------------------------------------

  /**
   * Applique un patch au champ à `path`.
   *
   * Changer le type d'un champ change ce qui a du sens de garder : des options sur un
   * champ texte, ou des sous-champs sur un champ date, n'ont plus de sens. On nettoie
   * ici plutôt que de laisser le schéma accumuler des propriétés orphelines.
   */
  patchField(path: FieldPath, patch: Partial<FieldSchema>): void {
    const next = structuredClone(this.schemaSignal());
    const field = this.fieldAt(next, path);

    if (!field) {
      return;
    }

    Object.assign(field, patch);

    if (patch.type) {
      this.normalizeForType(field);
    }

    this.schemaSignal.set(next);
  }

  /** Le schéma prêt à être envoyé au back : sans les propriétés vides. */
  toSchema(): FormSchema {
    return this.prune(structuredClone(this.schemaSignal()));
  }

  // ---------------------------------------------------------------------------
  // Navigation dans l'arbre
  // ---------------------------------------------------------------------------

  /** Résout un chemin en champ. */
  fieldAt(schema: FormSchema, path: FieldPath): FieldSchema | null {
    let fields: FieldSchema[] | undefined = schema.fields;
    let field: FieldSchema | undefined;

    for (const index of path) {
      field = fields?.[index];
      if (!field) {
        return null;
      }
      fields = field.fields;
    }

    return field ?? null;
  }

  /**
   * La liste de champs à `path` : la racine si le chemin est vide, sinon les `fields`
   * du conteneur visé (créés au besoin, pour qu'on puisse déposer dans un group vide).
   */
  private childrenAt(schema: FormSchema, path: FieldPath): FieldSchema[] | null {
    if (path.length === 0) {
      return schema.fields;
    }

    const parent = this.fieldAt(schema, path);
    if (!parent) {
      return null;
    }

    parent.fields ??= [];
    return parent.fields;
  }

  // ---------------------------------------------------------------------------
  // Fabrication de champs
  // ---------------------------------------------------------------------------

  private newField(type: FieldType, name: string): FieldSchema {
    const info = FIELD_TYPES.find((t) => t.type === type);

    const field: FieldSchema = {
      type,
      name,
      label: info?.label ?? name,
      cols: 12,
      validators: [],
    };

    this.normalizeForType(field);
    return field;
  }

  /** Aligne les propriétés du champ sur ce que son type exige, et purge le reste. */
  private normalizeForType(field: FieldSchema): void {
    const needsOptions = field.type === 'select' || field.type === 'radio';
    const isContainer = field.type === 'group' || field.type === 'array';
    const needsLookup = field.type === 'autocomplete';
    const supportsResultMapping = field.type === 'select' || field.type === 'autocomplete';

    if (needsOptions) {
      field.options ??= [
        { value: 'option1', label: 'Option 1' },
        { value: 'option2', label: 'Option 2' },
      ];
    } else {
      delete field.options;
    }

    if (isContainer) {
      field.fields ??= [];
      if (field.type === 'array') {
        field.addLabel ??= 'Ajouter';
        field.initialItems ??= 1;
      } else {
        delete field.addLabel;
        delete field.initialItems;
      }
      // Un conteneur n'a pas de contrôle propre : ces propriétés ne s'appliquent pas.
      delete field.placeholder;
      field.validators = [];
    } else {
      delete field.fields;
      delete field.addLabel;
      delete field.initialItems;
    }

    if (!needsLookup) {
      delete field.dataSourceId;
      delete field.lookupSource;
      delete field.lookupUrl;
      delete field.lookupKeyField;
      delete field.lookupValueField;
      delete field.lookupQueryParam;
    } else {
      field.lookupQueryParam ??= 'q';
    }

    if (!supportsResultMapping) {
      delete field.resultMappings;
    }
  }

  /** Nom unique parmi les frères : `email`, `email2`, `email3`… */
  private uniqueName(base: string, siblings: FieldSchema[]): string {
    const taken = new Set(siblings.map((f) => f.name));

    if (!taken.has(base)) {
      return base;
    }

    let i = 2;
    while (taken.has(`${base}${i}`)) {
      i++;
    }

    return `${base}${i}`;
  }

  // ---------------------------------------------------------------------------

  private emptySchema(): FormSchema {
    return {
      id: 'nouveau-formulaire',
      title: 'Nouveau formulaire',
      submitLabel: 'Enregistrer',
      fields: [],
    };
  }

  /** Retire les propriétés vides, pour que le JSON exporté reste lisible. */
  private prune(schema: FormSchema): FormSchema {
    const pruneFields = (fields: FieldSchema[]): FieldSchema[] =>
      fields.map((f) => {
        const out: FieldSchema = { ...f };

        if (!out.validators?.length) delete out.validators;
        if (!out.options?.length) delete out.options;
        if (!out.hint) delete out.hint;
        if (!out.placeholder) delete out.placeholder;
        if (!out.visibleIf) delete out.visibleIf;
        if (!out.dataSourceId) delete out.dataSourceId;
        if (!out.lookupSource) delete out.lookupSource;
        if (!out.lookupUrl) delete out.lookupUrl;
        if (!out.lookupKeyField) delete out.lookupKeyField;
        if (!out.lookupValueField) delete out.lookupValueField;
        if (!out.lookupQueryParam || out.lookupQueryParam === 'q') delete out.lookupQueryParam;
        if (!out.resultMappings?.length) delete out.resultMappings;
        if (out.fields?.length) {
          out.fields = pruneFields(out.fields);
        } else {
          delete out.fields;
        }

        return out;
      });

    const dataSources = schema.dataSources?.filter((x) => x.id || x.label || x.url).map((source) => {
      const out = { ...source };
      if (!out.queryParam || out.queryParam === 'q') delete out.queryParam;
      if (!out.availableFields?.length) delete out.availableFields;
      return out;
    });

    return { ...schema, fields: pruneFields(schema.fields), dataSources: dataSources?.length ? dataSources : undefined };
  }

  private uniqueDataSourceId(base: string, sources: DataSourceDefinition[]): string {
    const taken = new Set(sources.map((s) => s.id));

    if (!taken.has(base)) {
      return base;
    }

    let i = 2;
    while (taken.has(`${base}${i}`)) {
      i++;
    }

    return `${base}${i}`;
  }

  private flattenFields(fields: FieldSchema[]): FieldSchema[] {
    const flat: FieldSchema[] = [];

    for (const field of fields) {
      flat.push(field);
      if (field.fields?.length) {
        flat.push(...this.flattenFields(field.fields));
      }
    }

    return flat;
  }

  // ---------------------------------------------------------------------------
  // Chemins
  // ---------------------------------------------------------------------------

  private pathEquals(a: FieldPath | null, b: FieldPath | null): boolean {
    if (!a || !b || a.length !== b.length) {
      return false;
    }
    return a.every((v, i) => v === b[i]);
  }

  /** `a` est-il `prefix` lui-même, ou un descendant ? */
  private pathStartsWith(a: FieldPath | null, prefix: FieldPath): boolean {
    if (!a || a.length < prefix.length) {
      return false;
    }
    return prefix.every((v, i) => v === a[i]);
  }
}
