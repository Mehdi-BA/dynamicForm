import { JsonPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { FormSchema } from '../models/form-schema.model';
import { DynamicFormBuilderService } from '../services/dynamic-form-builder.service';
import { DynamicFieldComponent } from './dynamic-field.component';

/**
 * Composant public du moteur : on lui passe un schéma, il rend le formulaire.
 *
 *   <app-dynamic-form [schema]="schema" (submitted)="save($event)" />
 *
 * Il ne connaît aucun type de champ : il délègue à `DynamicFieldComponent`, qui
 * est récursif. Toute l'intelligence de structure vit dans le schéma.
 */
@Component({
  selector: 'app-dynamic-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DynamicFieldComponent,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    JsonPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dynamic-form.component.html',
  styleUrl: './dynamic-form.component.scss',
})
export class DynamicFormComponent {
  readonly schema = input.required<FormSchema>();

  /** Valeur initiale, pour un formulaire d'édition. */
  readonly value = input<Record<string, unknown>>();

  /** Affiche la valeur en direct sous le formulaire — utile en démo, à couper en prod. */
  readonly debug = input(false);

  readonly submitted = output<Record<string, unknown>>();

  private readonly builder = inject(DynamicFormBuilderService);

  private readonly formSignal = signal<FormGroup>(new FormGroup({}));

  /** Le FormGroup racine, reconstruit dès que le schéma change. */
  readonly form = computed(() => this.formSignal());

  /** Valeur courante, mise à jour en continu pour le panneau de debug. */
  readonly currentValue = signal<unknown>({});

  constructor() {
    // Reconstruire le formulaire à chaque nouveau schéma.
    effect(() => {
      const schema = this.schema();
      const initial = this.value();

      const form = this.builder.build(schema, initial);
      this.formSignal.set(form);
      this.currentValue.set(form.value);
    });

    // Suivre la valeur pour le panneau de debug.
    effect((onCleanup) => {
      const form = this.formSignal();
      const sub = form.valueChanges.subscribe(() => this.currentValue.set(form.value));
      onCleanup(() => sub.unsubscribe());
    });
  }

  onSubmit(): void {
    const form = this.form();

    if (form.invalid) {
      // Sans ça, les erreurs restent invisibles : Material n'affiche `mat-error`
      // que sur un contrôle "touched".
      form.markAllAsTouched();
      return;
    }

    // `value` et non `getRawValue()` : les champs masqués sont désactivés, donc
    // volontairement exclus du payload.
    this.submitted.emit(form.value as Record<string, unknown>);
  }

  onReset(): void {
    this.formSignal.set(this.builder.build(this.schema(), this.value()));
  }
}
