import { JsonPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { FormSchema } from '../models/form-schema.model';
import { DynamicFormBuilderService } from '../services/dynamic-form-builder.service';
import { DynamicFieldComponent } from './dynamic-field.component';

/**
 * Composant public du moteur : on lui passe un schéma et un FormGroup, il greffe les
 * contrôles du schéma dans ce groupe et rend les champs.
 *
 *   <app-dynamic-form [schema]="schema" [form]="monForm" />
 *
 * Il ne rend **que les champs** : ni carte, ni titre, ni bouton d'envoi. C'est l'application
 * appelante qui porte son `<form>`, sa validation et son envoi — le moteur n'y participe pas.
 * Les contrôles sont greffés à plat ; pour les imbriquer, passer directement le sous-groupe :
 *
 *   <app-dynamic-form [schema]="schema" [form]="monForm.get('adresse')" />
 *
 * Il ne connaît aucun type de champ : il délègue à `DynamicFieldComponent`, qui est récursif.
 * Toute l'intelligence de structure vit dans le schéma.
 */
@Component({
  selector: 'app-dynamic-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DynamicFieldComponent,
    MatCardModule,
    MatIconModule,
    JsonPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dynamic-form.component.html',
  styleUrl: './dynamic-form.component.scss',
})
export class DynamicFormComponent {
  readonly schema = input.required<FormSchema>();

  /**
   * Le FormGroup de l'appelant. Le moteur y greffe les contrôles décrits par le schéma.
   * Requis : sans groupe, le composant n'a rien à peupler ni à rendre.
   */
  readonly form = input.required<FormGroup>();

  /** Valeur initiale, pour un formulaire d'édition. */
  readonly value = input<Record<string, unknown>>();

  /** Affiche la valeur en direct sous les champs — utile en démo, à couper en prod. */
  readonly debug = input(false);

  private readonly builder = inject(DynamicFormBuilderService);

  /** Valeur courante, mise à jour en continu pour le panneau de debug. */
  readonly currentValue = signal<unknown>({});

  constructor() {
    // Greffer les contrôles du schéma dans le groupe de l'appelant.
    effect((onCleanup) => {
      const schema = this.schema();
      const form = this.form();
      const initial = this.value();

      this.builder.buildInto(form, schema.fields);

      if (initial) {
        this.builder.patch(form, schema.fields, initial);
      }

      this.currentValue.set(form.value);

      // Sans ça, le groupe de l'appelant garderait les contrôles de l'ancien schéma.
      onCleanup(() => {
        for (const field of schema.fields) {
          form.removeControl(field.name);
        }
      });
    });

    // Suivre la valeur pour le panneau de debug.
    effect((onCleanup) => {
      const form = this.form();
      const sub = form.valueChanges.subscribe(() => this.currentValue.set(form.value));
      onCleanup(() => sub.unsubscribe());
    });
  }
}
