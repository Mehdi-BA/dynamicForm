import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormGroup, FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { DynamicFormComponent } from '../dynamic-form/components/dynamic-form.component';
import { DataSourceDefinition, DataSourceFieldDefinition, FieldSchema, FormSchema } from '../dynamic-form/models/form-schema.model';
import { FormApiService, FormSummary } from '../dynamic-form/services/form-api.service';
import { FieldPropertiesComponent } from './components/field-properties.component';
import { SaveAsDialogComponent } from './components/save-as-dialog.component';
import { FieldTreeComponent } from './components/field-tree.component';
import { BuilderStateService, FIELD_TYPES } from './services/builder-state.service';

/**
 * Le form builder : on construit le schéma à la souris, l'aperçu se met à jour en direct.
 *
 * Trois colonnes — palette, arbre des champs, propriétés du champ sélectionné — et un
 * onglet d'aperçu qui rend le schéma en cours avec le moteur lui-même. C'est le même
 * `<app-dynamic-form>` que la démo : ce qu'on voit dans l'aperçu est exactement ce que
 * produira le formulaire enregistré.
 */
@Component({
  selector: 'app-form-builder',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    FieldTreeComponent,
    FieldPropertiesComponent,
    DynamicFormComponent,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatTabsModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  // Le state est fourni ici, pas en root : chaque visite du builder repart d'un état neuf.
  providers: [BuilderStateService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './form-builder.component.html',
  styleUrl: './form-builder.component.scss',
})
export class FormBuilderComponent {
  readonly state = inject(BuilderStateService);
  private readonly api = inject(FormApiService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  readonly fieldTypes = FIELD_TYPES;

  readonly existingForms = signal<FormSummary[]>([]);
  readonly lookupSources = signal<string[]>([]);
  readonly saving = signal(false);

  /** Datasources dont la détection des champs est en cours (spinner sur le bouton). */
  readonly probing = signal<Set<string>>(new Set());

  /** Erreurs de validation renvoyées par le back au dernier enregistrement. */
  readonly saveErrors = signal<string[]>([]);

  /** Le schéma nettoyé — ce qui sera envoyé, et ce que l'aperçu rend. */
  readonly schema = computed(() => this.state.toSchema());

  /** L'aperçu ne peut rien rendre tant qu'il n'y a aucun champ. */
  readonly canPreview = computed(() => this.schema().fields.length > 0);

  /**
   * Le FormGroup de l'aperçu : c'est le builder qui le fournit au moteur.
   * Recréé à chaque changement de schéma — l'aperçu se reconstruit à chaque modification,
   * et repartir d'un groupe neuf évite d'accumuler les contrôles des versions précédentes.
   */
  readonly previewForm = signal<FormGroup>(new FormGroup({}));

  readonly json = computed(() => JSON.stringify(this.schema(), null, 2));

  constructor() {
    this.api.listForms().subscribe((forms) => this.existingForms.set(forms));
    this.api.listLookupSources().subscribe((sources) => this.lookupSources.set(sources));

    // Repartir d'un groupe neuf quand la structure des champs change (ajout, suppression,
    // renommage). Suivre le schéma entier rappellerait à chaque frappe dans un libellé.
    effect(() => {
      this.fieldNames();
      untracked(() => this.previewForm.set(new FormGroup({})));
    });
  }

  /** La signature de structure de l'aperçu : les noms de champs, à plat et récursivement. */
  private readonly fieldNames = computed(() => {
    const walk = (fields: FieldSchema[]): string =>
      fields.map((f) => `${f.name}:${f.type}(${walk(f.fields ?? [])})`).join(',');

    return walk(this.schema().fields);
  });

  // ---------------------------------------------------------------------------

  /** Repart d'un formulaire existant, pour le modifier plutôt que tout ressaisir. */
  loadExisting(id: string): void {
    this.api.getSchema(id).subscribe({
      next: (schema) => {
        this.state.load(schema);
        this.saveErrors.set([]);
        // Rafraîchir les champs détectables : le mapping doit proposer ce que l'API renvoie.
        this.state.dataSources().forEach((_, i) => this.detectFields(i, { silent: true }));
      },
      error: () => this.snackBar.open('Chargement impossible.', 'OK', { duration: 3000 }),
    });
  }

  /** Une détection est-elle en cours pour cette datasource ? */
  isProbing(sourceId: string): boolean {
    return this.probing().has(sourceId);
  }

  /**
   * Appelle réellement l'URL de la datasource et remplit ses « champs disponibles » avec
   * les clés effectivement présentes dans la réponse. C'est ce qui garantit que le mapping
   * de résultat propose les vrais champs reçus, sans saisie manuelle.
   */
  detectFields(index: number, opts: { silent?: boolean } = {}): void {
    const source = this.state.dataSources()[index];
    if (!source?.url?.trim()) {
      if (!opts.silent) {
        this.snackBar.open('Renseigne d\'abord une URL pour cette datasource.', 'OK', { duration: 3000 });
      }
      return;
    }

    this.probing.update((set) => new Set(set).add(source.id));

    this.api.probeDataSourceFields(source.url, source.queryParam).subscribe({
      next: (paths) => {
        this.probing.update((set) => {
          const next = new Set(set);
          next.delete(source.id);
          return next;
        });

        if (!paths.length) {
          if (!opts.silent) {
            this.snackBar.open('Aucun champ détecté (réponse vide ou inaccessible).', 'OK', { duration: 3000 });
          }
          return;
        }

        // Fusion : on garde les libellés déjà saisis, on ajoute les champs nouvellement détectés.
        const existing = new Map((source.availableFields ?? []).map((f) => [f.path, f.label]));
        const availableFields: DataSourceFieldDefinition[] = paths.map((path) => ({
          path,
          label: existing.get(path) || path,
        }));

        this.state.updateDataSource(index, { availableFields });

        if (!opts.silent) {
          this.snackBar.open(`${paths.length} champ(s) détecté(s).`, 'OK', { duration: 2500 });
        }
      },
      error: () => {
        this.probing.update((set) => {
          const next = new Set(set);
          next.delete(source.id);
          return next;
        });
        if (!opts.silent) {
          this.snackBar.open('Détection impossible.', 'OK', { duration: 3000 });
        }
      },
    });
  }

  save(): void {
    const schema = this.schema();

    this.persistSchema(schema, `Formulaire « ${schema.title} » enregistré.`);
  }

  saveAs(): void {
    const current = this.schema();
    const title = `${current.title} copie`;
    const id = this.slugify(title) || `${current.id}-copie`;

    this.dialog
      .open(SaveAsDialogComponent, {
        data: { title, id },
        width: '520px',
        maxWidth: 'calc(100vw - 24px)',
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) {
          return;
        }

        const schema = {
          ...current,
          id: result.id,
          title: result.title,
        };

        this.persistSchema(schema, `Template « ${result.title} » créé.`, true);
      });
  }

  private persistSchema(
    schema: FormSchema,
    successMessage: string,
    reloadBuilder = false,
  ): void {

    this.saving.set(true);
    this.saveErrors.set([]);

    this.api.saveSchema(schema).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(successMessage, 'OK', { duration: 3000 });
        if (reloadBuilder) {
          this.state.load(schema);
        }
        // Le nouveau formulaire doit apparaître dans la liste des existants.
        this.api.listForms().subscribe((forms) => this.existingForms.set(forms));
      },
      error: (err) => {
        this.saving.set(false);

        // Le back renvoie la liste des incohérences du schéma : on les montre telles quelles,
        // c'est plus utile qu'un « échec » générique.
        const errors: string[] = err?.error?.errors ?? [];
        this.saveErrors.set(errors.length ? errors : ["Échec de l'enregistrement."]);
      },
    });
  }

  private slugify(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  copyJson(): void {
    navigator.clipboard.writeText(this.json()).then(
      () => this.snackBar.open('JSON copié.', 'OK', { duration: 2000 }),
      () => this.snackBar.open('Copie impossible.', 'OK', { duration: 2000 }),
    );
  }

  addDataSource(): void {
    this.state.addDataSource();
  }

  updateDataSource(index: number, patch: Partial<DataSourceDefinition>): void {
    const current = this.state.dataSources()[index];
    if (!current) {
      return;
    }

    const next: Partial<DataSourceDefinition> = { ...patch };

    if (patch.label !== undefined && patch.id === undefined && current.id === this.slugify(current.label)) {
      next.id = this.slugify(patch.label) || current.id;
    }

    this.state.updateDataSource(index, next);
  }

  removeDataSource(index: number): void {
    this.state.removeDataSource(index);
  }

  addDataSourceField(sourceIndex: number): void {
    const source = this.state.dataSources()[sourceIndex];
    if (!source) {
      return;
    }

    const availableFields = [...(source.availableFields ?? []), { path: '', label: '' }];
    this.state.updateDataSource(sourceIndex, { availableFields });
  }

  updateDataSourceField(sourceIndex: number, fieldIndex: number, patch: Partial<DataSourceFieldDefinition>): void {
    const source = this.state.dataSources()[sourceIndex];
    if (!source) {
      return;
    }

    const availableFields = [...(source.availableFields ?? [])];
    if (!availableFields[fieldIndex]) {
      return;
    }

    availableFields[fieldIndex] = { ...availableFields[fieldIndex], ...patch };
    this.state.updateDataSource(sourceIndex, { availableFields });
  }

  removeDataSourceField(sourceIndex: number, fieldIndex: number): void {
    const source = this.state.dataSources()[sourceIndex];
    if (!source) {
      return;
    }

    const availableFields = [...(source.availableFields ?? [])];
    availableFields.splice(fieldIndex, 1);
    this.state.updateDataSource(sourceIndex, { availableFields });
  }
}
