import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { FieldDefinition, FieldSchema } from '../dynamic-form/models/form-schema.model';
import { FormApiService } from '../dynamic-form/services/form-api.service';
import { FieldPropertiesComponent } from '../form-builder/components/field-properties.component';
import { BuilderStateService, TYPE_ICONS, TYPE_LABELS } from '../form-builder/services/builder-state.service';

/**
 * La bibliothèque de champs métier : les modèles à partir desquels le form builder compose
 * ses formulaires.
 *
 * Le panneau d'édition est celui du builder (`FieldPropertiesComponent`) : on lui fournit un
 * `BuilderStateService` local, dont le schéma ne contient que le champ en cours. Réutiliser
 * l'éditeur plutôt que d'en écrire un second garantit qu'un champ se configure exactement
 * pareil ici et dans le builder.
 *
 * `cols` et `visibleIf` sont volontairement hors sujet ici : ils dépendent du formulaire qui
 * accueillera le champ, pas du champ lui-même.
 */
@Component({
  selector: 'app-field-library',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    FieldPropertiesComponent,
    MatToolbarModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatTooltipModule,
  ],
  // Un state local, uniquement pour piloter l'éditeur de champ.
  providers: [BuilderStateService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './field-library.component.html',
  styleUrl: './field-library.component.scss',
})
export class FieldLibraryComponent {
  private readonly api = inject(FormApiService);
  private readonly snackBar = inject(MatSnackBar);
  readonly state = inject(BuilderStateService);

  readonly fields = signal<FieldDefinition[]>([]);
  readonly saving = signal(false);
  readonly errors = signal<string[]>([]);

  /** L'entête du champ en cours d'édition (id, label, icon…), ou null si aucun. */
  readonly draft = signal<Omit<FieldDefinition, 'field'> | null>(null);

  /** Le champ édité, tenu par le state local — c'est ce que l'éditeur écrit. */
  readonly editedField = computed(() => this.state.selectedField());

  readonly isNew = signal(false);

  readonly typeIcons = TYPE_ICONS;
  readonly typeLabels = TYPE_LABELS;

  constructor() {
    this.reload();
  }

  reload(): void {
    this.api.listFields().subscribe((fields) => this.fields.set(fields));
  }

  // ---------------------------------------------------------------------------
  // Ouverture / création
  // ---------------------------------------------------------------------------

  edit(definition: FieldDefinition): void {
    this.isNew.set(false);
    this.errors.set([]);
    this.draft.set({
      id: definition.id,
      label: definition.label,
      icon: definition.icon,
      description: definition.description,
    });

    this.loadIntoEditor(definition.field);
  }

  createNew(): void {
    this.isNew.set(true);
    this.errors.set([]);
    this.draft.set({ id: '', label: '', icon: 'short_text', description: '' });

    this.loadIntoEditor({ type: 'text', name: '', label: '', validators: [] });
  }

  cancel(): void {
    this.draft.set(null);
    this.state.select(null);
  }

  /** Charge un champ seul dans le state local, et le sélectionne : l'éditeur travaille dessus. */
  private loadIntoEditor(field: FieldSchema): void {
    this.state.load({ id: 'library', title: 'library', fields: [structuredClone(field)] });
    this.state.select([0]);
  }

  // ---------------------------------------------------------------------------
  // Entête du champ
  // ---------------------------------------------------------------------------

  patchDraft(patch: Partial<Omit<FieldDefinition, 'field'>>): void {
    this.draft.update((d) => (d ? { ...d, ...patch } : d));

    // Tant que l'id suit le libellé, on le garde synchrone : le saisir deux fois n'apporte rien.
    if (patch.label !== undefined && this.isNew()) {
      const slug = this.slugify(patch.label);
      this.draft.update((d) => (d ? { ...d, id: slug } : d));

      // Le nom technique du champ suit le même chemin, tant qu'il n'a pas été personnalisé.
      const field = this.editedField();
      if (field && (!field.name || field.name === this.slugify(field.label ?? ''))) {
        this.state.patchField([0], { name: slug, label: patch.label });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Enregistrement / suppression
  // ---------------------------------------------------------------------------

  save(): void {
    const draft = this.draft();
    const field = this.editedField();

    if (!draft || !field) {
      return;
    }

    const definition: FieldDefinition = {
      id: draft.id.trim(),
      label: draft.label.trim(),
      icon: draft.icon.trim() || 'short_text',
      description: draft.description?.trim() || undefined,
      field: structuredClone(field),
    };

    this.saving.set(true);
    this.errors.set([]);

    this.api.saveField(definition).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(`Champ « ${definition.label} » enregistré.`, 'OK', { duration: 2500 });
        this.isNew.set(false);
        this.reload();
      },
      error: (err) => {
        this.saving.set(false);
        // Le back renvoie la liste des incohérences : plus utile qu'un « échec » générique.
        const errors: string[] = err?.error?.errors ?? [];
        this.errors.set(errors.length ? errors : ["Échec de l'enregistrement."]);
      },
    });
  }

  remove(definition: FieldDefinition, event: Event): void {
    event.stopPropagation();

    this.api.deleteField(definition.id).subscribe({
      next: () => {
        this.snackBar.open(`Champ « ${definition.label} » supprimé.`, 'OK', { duration: 2500 });
        if (this.draft()?.id === definition.id) {
          this.cancel();
        }
        this.reload();
      },
      error: () => this.snackBar.open('Suppression impossible.', 'OK', { duration: 3000 }),
    });
  }

  // ---------------------------------------------------------------------------

  /** « Prénom » -> « prenom ». Les accents sont retirés, pas transformés en tirets. */
  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
