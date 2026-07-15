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
import { startWith } from 'rxjs';
import { FieldSchema } from '../models/form-schema.model';
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

  /** Options de la source de lookup (autocomplete), une fois chargées. */
  private readonly lookupItems = signal<LookupItem[]>([]);

  /** Ce que l'utilisateur a tapé dans l'autocomplete. */
  private readonly typed = signal('');

  /** Le champ passe-t-il sa condition d'affichage ? */
  readonly visible = computed(() =>
    this.conditions.evaluate(this.field().visibleIf, this.rootValue()),
  );

  /** Options de l'autocomplete filtrées par la saisie. */
  readonly visibleLookupItems = computed(() => {
    const items = this.lookupItems();
    const needle = this.typed().toLowerCase().trim();

    if (!needle) {
      return items;
    }

    // Si la saisie correspond à un code déjà sélectionné, on réaffiche toute la liste
    // plutôt qu'une liste vide (le champ contient "TN", pas "Tunisie").
    if (items.some((i) => i.value.toLowerCase() === needle)) {
      return items;
    }

    return items.filter((i) => i.label.toLowerCase().includes(needle));
  });

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

    // Charger la source de lookup et suivre la saisie, pour les champs autocomplete.
    effect((onCleanup) => {
      const schema = this.field();
      const source = schema.lookupSource;

      if (schema.type !== 'autocomplete' || !source) {
        return;
      }

      const lookupSub = this.api.loadLookup(source).subscribe((items) => this.lookupItems.set(items));

      const control = untracked(() => this.control());
      const typedSub = control?.valueChanges
        .pipe(startWith(control.value))
        .subscribe((v) => this.typed.set(String(v ?? '')));

      onCleanup(() => {
        lookupSub.unsubscribe();
        typedSub?.unsubscribe();
      });
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
