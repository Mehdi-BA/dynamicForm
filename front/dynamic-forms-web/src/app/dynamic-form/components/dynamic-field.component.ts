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
import {
  MatAutocompleteModule,
  MatAutocompleteSelectedEvent,
} from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { debounceTime, startWith, Subscription, switchMap } from 'rxjs';
import { FieldSchema, Resource, ResourceOption } from '../models/form-schema.model';
import { ConditionEvaluatorService } from '../services/condition-evaluator.service';
import { DynamicFormBuilderService } from '../services/dynamic-form-builder.service';
import { FormApiService } from '../services/form-api.service';
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

  /** Options d'autocomplete produites par l'exécution de la ressource. */
  private readonly resourceOptions = signal<ResourceOption[]>([]);

  /** La ressource courante du champ, une fois chargée — porte le mapping et les règles d'exécution. */
  private readonly currentResource = signal<Resource | null>(null);

  /** Le champ passe-t-il sa condition d'affichage ? */
  readonly visible = computed(() =>
    this.conditions.evaluate(this.field().visibleIf, this.rootValue()),
  );

  /**
   * Options affichées dans l'autocomplete. La ressource est réexécutée à chaque frappe
   * (l'API peut filtrer côté serveur), donc les options sont déjà le bon sous-ensemble :
   * on les expose telles quelles.
   */
  readonly visibleOptions = computed(() => this.resourceOptions());

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

    // Charger la ressource et l'exécuter à chaque frappe, pour les champs autocomplete.
    effect((onCleanup) => {
      const schema = this.field();
      const resourceId = schema.resourceId;

      if (schema.type !== 'autocomplete' || !resourceId) {
        return;
      }

      const control = untracked(() => this.control());
      const subs = new Subscription();

      subs.add(
        this.api.getResource(resourceId).subscribe((resource) => {
          this.currentResource.set(resource);

          // La saisie pilote l'exécution : `q` part au back, qui filtre. debounce + switchMap
          // pour ne garder que la dernière requête en vol.
          if (control) {
            subs.add(
              control.valueChanges
                .pipe(
                  startWith(control.value),
                  debounceTime(250),
                  switchMap((v) => this.api.executeResource(resource, String(v ?? ''))),
                )
                .subscribe((options) => this.resourceOptions.set(options)),
            );
          }
        }),
      );

      onCleanup(() => subs.unsubscribe());
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

  /** Le contrôle stocke la valeur (ex: un id) ; on affiche le libellé de l'option. */
  displayOption = (value: string): string => {
    if (!value) {
      return '';
    }

    return this.resourceOptions().find((o) => o.value === value)?.label ?? value;
  };

  /**
   * À la sélection d'une option, applique les règles d'auto-remplissage du champ : la valeur
   * du champ extra `from` de l'option est écrite dans le champ du formulaire ciblé par `to`.
   * `FormGroup.get('adresse.ville')` résout nativement le chemin pointé.
   */
  onOptionSelected(event: MatAutocompleteSelectedEvent): void {
    const rules = this.field().fill;
    if (!rules?.length) {
      return;
    }

    const option = this.resourceOptions().find((o) => o.value === event.option.value);
    if (!option) {
      return;
    }

    for (const rule of rules) {
      const target = this.rootForm().get(rule.to);
      if (target) {
        target.patchValue(option.extra[rule.from]);
      }
    }
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
