import {
  ChangeDetectionStrategy,
  Component,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Resource, ResourceParam } from '../../dynamic-form/models/form-schema.model';
import { FormApiService } from '../../dynamic-form/services/form-api.service';

/**
 * Le brouillon en cours d'édition. `extraFieldsText` est la saisie brute des champs extra
 * (séparés par des virgules), convertie en tableau seulement à l'enregistrement — plus simple
 * à éditer qu'une liste de contrôles.
 */
interface ResourceDraft {
  id: string;
  name: string;
  url: string;
  params: ResourceParam[];
  valueField: string;
  labelField: string;
  extraFieldsText: string;
}

/**
 * Gestionnaire des ressources (data sources) : l'onglet « Data Source » du form builder.
 *
 * Colonne gauche : la liste des ressources. Colonne droite : l'éditeur du brouillon courant
 * (url, paramètres, mapping). Chaque enregistrement passe par le back, qui valide, puis on
 * émet `changed` pour que le builder recharge la liste des ressources sélectionnables.
 */
@Component({
  selector: 'app-resource-manager',
  standalone: true,
  imports: [
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resource-manager.component.html',
  styleUrl: './resource-manager.component.scss',
})
export class ResourceManagerComponent {
  /** Émis après toute création / modification / suppression, pour recharger la liste amont. */
  readonly changed = output<void>();

  private readonly api = inject(FormApiService);
  private readonly snackBar = inject(MatSnackBar);

  readonly resources = signal<Resource[]>([]);

  /** Le brouillon en cours, ou null quand aucune ressource n'est ouverte. */
  readonly draft = signal<ResourceDraft | null>(null);

  /** Vrai si le brouillon crée une nouvelle ressource (id absent du catalogue). */
  readonly isNew = signal(false);

  readonly saving = signal(false);

  constructor() {
    this.reload();
  }

  reload(): void {
    this.api.listResources().subscribe((resources) => this.resources.set(resources));
  }

  // ---------------------------------------------------------------------------
  // Ouverture / création
  // ---------------------------------------------------------------------------

  edit(resource: Resource): void {
    this.isNew.set(false);
    this.draft.set(this.toDraft(resource));
  }

  createNew(): void {
    this.isNew.set(true);
    this.draft.set({
      id: '',
      name: '',
      url: '',
      params: [{ name: 'q', defaultValue: '' }],
      valueField: 'id',
      labelField: 'label',
      extraFieldsText: '',
    });
  }

  cancel(): void {
    this.draft.set(null);
  }

  // ---------------------------------------------------------------------------
  // Édition du brouillon
  // ---------------------------------------------------------------------------

  patchDraft(patch: Partial<ResourceDraft>): void {
    this.draft.update((d) => (d ? { ...d, ...patch } : d));
  }

  addParam(): void {
    this.draft.update((d) => (d ? { ...d, params: [...d.params, { name: '', defaultValue: '' }] } : d));
  }

  updateParam(index: number, patch: Partial<ResourceParam>): void {
    this.draft.update((d) => {
      if (!d) {
        return d;
      }
      const params = [...d.params];
      params[index] = { ...params[index], ...patch };
      return { ...d, params };
    });
  }

  removeParam(index: number): void {
    this.draft.update((d) => {
      if (!d) {
        return d;
      }
      const params = [...d.params];
      params.splice(index, 1);
      return { ...d, params };
    });
  }

  // ---------------------------------------------------------------------------
  // Enregistrement / suppression
  // ---------------------------------------------------------------------------

  save(): void {
    const draft = this.draft();
    if (!draft) {
      return;
    }

    const resource = this.fromDraft(draft);

    if (!resource.id.trim()) {
      this.snackBar.open("L'identifiant est obligatoire.", 'OK', { duration: 3000 });
      return;
    }

    this.saving.set(true);

    this.api.saveResource(resource).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(`Ressource « ${resource.name || resource.id} » enregistrée.`, 'OK', {
          duration: 2500,
        });
        this.isNew.set(false);
        this.reload();
        this.changed.emit();
      },
      error: (err) => {
        this.saving.set(false);
        const errors: string[] = err?.error?.errors ?? [];
        this.snackBar.open(
          errors.length ? errors.join(' ') : "Échec de l'enregistrement.",
          'OK',
          { duration: 5000 },
        );
      },
    });
  }

  remove(resource: Resource, event: Event): void {
    event.stopPropagation();

    this.api.deleteResource(resource.id).subscribe({
      next: () => {
        this.snackBar.open(`Ressource « ${resource.name || resource.id} » supprimée.`, 'OK', {
          duration: 2500,
        });
        if (this.draft()?.id === resource.id) {
          this.draft.set(null);
        }
        this.reload();
        this.changed.emit();
      },
      error: () => this.snackBar.open('Suppression impossible.', 'OK', { duration: 3000 }),
    });
  }

  // ---------------------------------------------------------------------------
  // Conversions brouillon <-> ressource
  // ---------------------------------------------------------------------------

  private toDraft(resource: Resource): ResourceDraft {
    return {
      id: resource.id,
      name: resource.name,
      url: resource.url,
      params: (resource.params ?? []).map((p) => ({ ...p })),
      valueField: resource.mapping.valueField,
      labelField: resource.mapping.labelField,
      extraFieldsText: (resource.mapping.extraFields ?? []).join(', '),
    };
  }

  private fromDraft(draft: ResourceDraft): Resource {
    const extraFields = draft.extraFieldsText
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    return {
      id: draft.id.trim(),
      name: draft.name.trim(),
      url: draft.url.trim(),
      method: 'GET',
      params: draft.params.filter((p) => p.name.trim().length > 0),
      mapping: {
        valueField: draft.valueField.trim(),
        labelField: draft.labelField.trim(),
        extraFields,
      },
    };
  }
}
