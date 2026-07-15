import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
} from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { catchError, debounceTime, distinctUntilChanged, of, startWith, switchMap } from 'rxjs';
import { DataSourceDefinition, FieldSchema, OptionSchema } from '../models/form-schema.model';
import { ConditionEvaluatorService } from '../services/condition-evaluator.service';
import { DynamicFormBuilderService } from '../services/dynamic-form-builder.service';
import { FormApiService, LookupItem } from '../services/form-api.service';
import { ValidatorRegistryService } from '../services/validator-registry.service';

/**
 * Rend un champ du schéma.
 *
 * Le composant est **récursif** : un champ `group` ou `array` re-rend
 * `<app-dynamic-field>` pour chacun de ses sous-champs. C'est ce qui donne les
 * sous-formulaires et les listes imbriquées à profondeur quelconque, sans code
 * spécifique par niveau.
 *
 * Il reçoit `rootForm` en plus de `parent` : une condition `visibleIf` peut cibler
 * n'importe quel champ du formulaire, pas seulement un frère.
 */
@Component({
  selector: 'app-dynamic-field',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatRadioModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatIconModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dynamic-field.component.html',
  styleUrl: './dynamic-field.component.scss',
})
export class DynamicFieldComponent {
  readonly field = input.required<FieldSchema>();
  readonly dataSources = input<DataSourceDefinition[]>([]);

  /** Le FormGroup qui contient directement ce champ (pas forcément la racine). */
  readonly parent = input.required<FormGroup>();

  /** La racine du formulaire — nécessaire pour résoudre les chemins des conditions. */
  readonly rootForm = input.required<FormGroup>();

  private readonly conditions = inject(ConditionEvaluatorService);
  private readonly builder = inject(DynamicFormBuilderService);
  private readonly registry = inject(ValidatorRegistryService);
  private readonly api = inject(FormApiService);

  /**
   * Valeur courante du formulaire racine.
   *
   * `getRawValue()` et non `value` : la valeur d'un contrôle désactivé est absente de
   * `value`, or on désactive justement les champs masqués. Sans le raw, une condition
   * portant sur un champ masqué ne pourrait plus jamais redevenir vraie.
   */
  private readonly rootValue = signal<unknown>({});

  /** Options de la source de lookup (autocomplete), alimentées par recherche distante. */
  readonly lookupItems = signal<LookupItem[]>([]);
  readonly selectItems = computed(() => {
    const schema = this.field();
    const source = this.dataSourceFor(schema);

    if (schema.type === 'select' && source) {
      return this.lookupItems();
    }

    return [];
  });

  /** Le champ passe-t-il sa condition d'affichage ? */
  readonly visible = computed(() =>
    this.conditions.evaluate(this.field().visibleIf, this.rootValue()),
  );

  constructor() {
    // Suivre la valeur de la racine, pour réévaluer les conditions.
    effect((onCleanup) => {
      const root = this.rootForm();
      this.rootValue.set(root.getRawValue());

      const sub = root.valueChanges.subscribe(() => this.rootValue.set(root.getRawValue()));

      onCleanup(() => sub.unsubscribe());
    });

    /**
     * Un champ masqué est désactivé : sa valeur sort du payload et ses validateurs
     * cessent de bloquer la soumission. Sans ça un `required` sur un champ invisible
     * rendrait le formulaire invalide sans que l'utilisateur puisse rien y faire.
     */
    effect(() => {
      const isVisible = this.visible();
      const control = untracked(() => this.control());
      const schema = untracked(() => this.field());

      if (!control) {
        return;
      }

      if (isVisible && control.disabled && !schema.disabled) {
        control.enable({ emitEvent: false });
      } else if (!isVisible && control.enabled) {
        control.disable({ emitEvent: false });
      }
    });

    // Charger/résoudre la valeur courante puis rechercher côté API pendant la saisie.
    effect((onCleanup) => {
      const schema = this.field();
      const control = untracked(() => this.control());

      const source = this.dataSourceFor(schema);

      if ((schema.type !== 'autocomplete' && !(schema.type === 'select' && source)) || !control) {
        return;
      }

      const currentValue = String(control.value ?? '').trim();
      const resolveSub = schema.type === 'autocomplete' && currentValue
        ? this.resolveLookup(schema, currentValue).subscribe((item) => {
            if (!item) {
              return;
            }

            this.lookupItems.update((items) => {
              if (items.some((x) => x.value === item.value)) {
                return items;
              }

              return [item, ...items];
            });
          })
        : null;

      const searchSub = control.valueChanges
        .pipe(
          startWith(schema.type === 'select' ? control.value : ''),
          debounceTime(schema.type === 'autocomplete' ? 250 : 0),
          distinctUntilChanged(),
          switchMap((value) => this.searchLookup(schema, schema.type === 'autocomplete' ? String(value ?? '').trim() : '')),
          catchError(() => of([] as LookupItem[])),
        )
        .subscribe((items) => {
          const selectedValue = String(control.value ?? '').trim();
          const selected = this.lookupItems().find((item) => item.value === selectedValue);

          if (selected && !items.some((item) => item.value === selected.value)) {
            this.lookupItems.set([selected, ...items]);
            return;
          }

          this.lookupItems.set(items);
        });

      onCleanup(() => {
        resolveSub?.unsubscribe();
        searchSub.unsubscribe();
      });
    });

    // Propager les valeurs du résultat sélectionné vers les champs cibles configurés.
    effect((onCleanup) => {
      const schema = this.field();
      const control = untracked(() => this.control());

      if (!control || !schema.resultMappings?.length) {
        return;
      }

      if (schema.type !== 'autocomplete' && schema.type !== 'select') {
        return;
      }

      const sub = control.valueChanges.pipe(startWith(control.value)).subscribe((value) => {
        const result = this.selectedResult(schema, value);
        if (!result) {
          return;
        }

        this.applyResultMappings(schema, result);
      });

      onCleanup(() => sub.unsubscribe());
    });
  }

  // ---------------------------------------------------------------------------
  // Accès aux contrôles
  // ---------------------------------------------------------------------------

  control(): AbstractControl | null {
    return this.parent().get(this.field().name);
  }

  get formControl(): FormControl {
    return this.control() as FormControl;
  }

  get formGroup(): FormGroup {
    return this.control() as FormGroup;
  }

  get formArray(): FormArray {
    return this.control() as FormArray;
  }

  /** Les lignes du FormArray, typées pour l'itération dans le template. */
  arrayRows(): FormGroup[] {
    return this.formArray.controls as FormGroup[];
  }

  // ---------------------------------------------------------------------------
  // Array : ajout / suppression de lignes
  // ---------------------------------------------------------------------------

  addRow(): void {
    this.formArray.push(this.builder.buildArrayItem(this.field()));
  }

  removeRow(index: number): void {
    this.formArray.removeAt(index);
  }

  // ---------------------------------------------------------------------------
  // Autocomplete
  // ---------------------------------------------------------------------------

  /** Le contrôle stocke le code ("TN") ; on affiche le libellé ("Tunisie"). */
  displayLookup = (value: string): string => {
    if (!value) {
      return '';
    }

    return this.lookupItems().find((i) => i.value === value)?.label ?? value;
  };

  private searchLookup(schema: FieldSchema, query: string) {
    const dataSource = this.dataSourceFor(schema);
    const lookupUrl = dataSource?.url?.trim() || schema.lookupUrl?.trim();

    if (lookupUrl) {
      return this.api.searchLookupByUrl(
        {
          lookupUrl,
          lookupKeyField: dataSource?.valueField || schema.lookupKeyField,
          lookupValueField: dataSource?.displayField || schema.lookupValueField,
          lookupQueryParam: dataSource?.queryParam || schema.lookupQueryParam,
        },
        query,
      );
    }

    return this.api.searchLookupBySource(schema.lookupSource ?? '', query);
  }

  private resolveLookup(schema: FieldSchema, key: string) {
    if (this.dataSourceFor(schema)?.url?.trim()) {
      return of(null as LookupItem | null);
    }

    const source = schema.lookupSource?.trim();

    // Le mode URL n'impose pas de route de résolution : on garde la clé tant que
    // l'utilisateur n'a pas relancé une recherche qui renvoie le libellé.
    if (!source || schema.lookupUrl?.trim()) {
      return of(null as LookupItem | null);
    }

    return this.api.resolveLookupBySource(source, key);
  }

  private selectedResult(schema: FieldSchema, selectedValue: unknown): Record<string, unknown> | null {
    if (schema.type === 'autocomplete') {
      const item = this.lookupItems().find((x) => x.value === String(selectedValue ?? ''));
      if (!item) {
        return null;
      }

      return item.raw ?? { value: item.value, label: item.label };
    }

    if (schema.type === 'select') {
      const selectItem = this.lookupItems().find((x) => this.sameValue(x.value, selectedValue));
      if (selectItem) {
        return selectItem.raw ?? { value: selectItem.value, label: selectItem.label };
      }

      const option = (schema.options ?? []).find((o) => this.sameValue(o.value, selectedValue));
      if (!option) {
        return null;
      }

      const data = this.optionData(option);
      return { value: option.value, label: option.label, data };
    }

    return null;
  }

  private applyResultMappings(schema: FieldSchema, result: Record<string, unknown>): void {
    const mappings = schema.resultMappings ?? [];

    for (const mapping of mappings) {
      const targetPath = mapping.targetField?.trim();
      if (!targetPath || targetPath === schema.name) {
        continue;
      }

      const target = this.rootForm().get(targetPath);
      if (!target || target.disabled) {
        continue;
      }

      const sourcePath = mapping.sourceField?.trim();
      const next = sourcePath ? this.valueAtPath(result, sourcePath) : undefined;

      if (this.sameValue(target.value, next ?? null)) {
        continue;
      }

      target.setValue(next ?? null);
    }
  }

  private valueAtPath(source: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.').map((p) => p.trim()).filter(Boolean);

    let current: unknown = source;
    for (const part of parts) {
      if (!current || typeof current !== 'object' || !(part in (current as Record<string, unknown>))) {
        return undefined;
      }

      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  private optionData(option: OptionSchema): Record<string, unknown> {
    return option.data && typeof option.data === 'object' ? option.data : {};
  }

  private dataSourceFor(schema: FieldSchema): DataSourceDefinition | null {
    const id = schema.dataSourceId?.trim();

    if (!id) {
      return null;
    }

    return this.dataSources().find((source) => source.id === id) ?? null;
  }

  private sameValue(a: unknown, b: unknown): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  // ---------------------------------------------------------------------------
  // Erreurs
  // ---------------------------------------------------------------------------

  /** Message d'erreur du champ, une fois qu'il a été touché. */
  errorMessage(): string | null {
    const control = this.control();

    if (!control || !control.touched || control.valid) {
      return null;
    }

    return this.registry.messageFor(control);
  }

  /** Le champ porte-t-il un `required` ? Sert à afficher l'astérisque. */
  isRequired(): boolean {
    return !!this.field().validators?.some((v) => v.type === 'required');
  }
}
