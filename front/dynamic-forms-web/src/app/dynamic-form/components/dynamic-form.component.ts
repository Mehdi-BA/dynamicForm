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
 *
 * Deux usages, selon `schema.kind` :
 *
 * - **Formulaire complet** (`kind: 'form'`, défaut) — le composant est autonome : il crée son
 *   FormGroup, affiche sa carte, son titre et son bouton d'envoi, et émet `submitted`.
 *
 * - **Fragment** (`kind: 'fragment'`) — seulement les champs, sans carte ni bouton. L'hôte
 *   fournit son propre FormGroup et garde la maîtrise de la validation et de l'envoi :
 *
 *   ```html
 *   <!-- à plat dans le groupe de l'hôte -->
 *   <app-dynamic-form [schema]="frag" [parentGroup]="monForm" />
 *
 *   <!-- ou regroupés sous un nom : monForm.get('adresse.rue') -->
 *   <app-dynamic-form [schema]="frag" [parentGroup]="monForm" [groupName]="'adresse'" />
 *   ```
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

  /**
   * Le FormGroup de l'application hôte, quand ce schéma est intégré dans un formulaire plus
   * large. Fourni : les champs y sont greffés. Absent : le composant crée son propre groupe.
   */
  readonly parentGroup = input<FormGroup>();

  /**
   * Avec `parentGroup` : regroupe les champs sous ce nom (`monForm.get('adresse.rue')`).
   * Sans : les champs sont greffés à plat dans le groupe de l'hôte.
   */
  readonly groupName = input<string>();

  /** Affiche la valeur en direct sous le formulaire — utile en démo, à couper en prod. */
  readonly debug = input(false);

  readonly submitted = output<Record<string, unknown>>();

  /** Un fragment ne rend que ses champs : ni carte, ni titre, ni bouton d'envoi. */
  readonly isFragment = computed(() => this.schema().kind === 'fragment');

  private readonly builder = inject(DynamicFormBuilderService);

  private readonly formSignal = signal<FormGroup>(new FormGroup({}));

  /** Le FormGroup racine, reconstruit dès que le schéma change. */
  readonly form = computed(() => this.formSignal());

  /** Valeur courante, mise à jour en continu pour le panneau de debug. */
  readonly currentValue = signal<unknown>({});

  constructor() {
    // Reconstruire le formulaire à chaque nouveau schéma.
    effect((onCleanup) => {
      const schema = this.schema();
      const initial = this.value();
      const parent = this.parentGroup();
      const name = this.groupName();

      // Sans groupe hôte : le composant est autonome, il crée son propre FormGroup racine.
      if (!parent) {
        const form = this.builder.build(schema, initial);
        this.formSignal.set(form);
        this.currentValue.set(form.value);
        return;
      }

      // Avec un groupe hôte : on greffe. Sous un sous-groupe nommé, ou à plat.
      const group = name
        ? this.attachNamedGroup(parent, name, schema, initial)
        : this.attachFlat(parent, schema, initial);

      this.formSignal.set(group);
      this.currentValue.set(group.value);

      // Sans ça, le groupe de l'hôte garderait des contrôles fantômes après un changement
      // de schéma ou la destruction du fragment.
      onCleanup(() => {
        if (name) {
          parent.removeControl(name);
        } else {
          for (const field of schema.fields) {
            parent.removeControl(field.name);
          }
        }
      });
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

  // ---------------------------------------------------------------------------
  // Greffe dans le FormGroup de l'hôte
  // ---------------------------------------------------------------------------

  /** Les champs vivent dans un sous-groupe nommé : `monForm.get('adresse.rue')`. */
  private attachNamedGroup(
    parent: FormGroup,
    name: string,
    schema: FormSchema,
    initial: Record<string, unknown> | undefined,
  ): FormGroup {
    const group = this.builder.build(schema, initial);

    // `setControl` et non `addControl` : idempotent si le schéma est reconstruit.
    parent.setControl(name, group);

    return group;
  }

  /** Les champs sont greffés directement dans le groupe de l'hôte. */
  private attachFlat(
    parent: FormGroup,
    schema: FormSchema,
    initial: Record<string, unknown> | undefined,
  ): FormGroup {
    this.builder.buildInto(parent, schema.fields);

    if (initial) {
      this.builder.patch(parent, schema.fields, initial);
    }

    return parent;
  }
}
