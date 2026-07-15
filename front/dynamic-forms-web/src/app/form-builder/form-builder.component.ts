import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
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
import { Resource } from '../dynamic-form/models/form-schema.model';
import { FormApiService, FormSummary } from '../dynamic-form/services/form-api.service';
import { FieldPropertiesComponent } from './components/field-properties.component';
import { FieldTreeComponent } from './components/field-tree.component';
import { ResourceManagerComponent } from './components/resource-manager.component';
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
    ResourceManagerComponent,
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

  readonly fieldTypes = FIELD_TYPES;

  readonly existingForms = signal<FormSummary[]>([]);
  readonly resources = signal<Resource[]>([]);
  readonly saving = signal(false);

  /** Erreurs de validation renvoyées par le back au dernier enregistrement. */
  readonly saveErrors = signal<string[]>([]);

  /** Le schéma nettoyé — ce qui sera envoyé, et ce que l'aperçu rend. */
  readonly schema = computed(() => this.state.toSchema());

  /** L'aperçu ne peut rien rendre tant qu'il n'y a aucun champ. */
  readonly canPreview = computed(() => this.schema().fields.length > 0);

  readonly json = computed(() => JSON.stringify(this.schema(), null, 2));

  constructor() {
    this.api.listForms().subscribe((forms) => this.existingForms.set(forms));
    this.reloadResources();
  }

  // ---------------------------------------------------------------------------

  /** Recharge les ressources — appelé au démarrage et après tout changement dans l'onglet Data Source. */
  reloadResources(): void {
    this.api.listResources().subscribe((resources) => this.resources.set(resources));
  }

  /** Repart d'un formulaire existant, pour le modifier plutôt que tout ressaisir. */
  loadExisting(id: string): void {
    this.api.getSchema(id).subscribe({
      next: (schema) => {
        this.state.load(schema);
        this.saveErrors.set([]);
      },
      error: () => this.snackBar.open('Chargement impossible.', 'OK', { duration: 3000 }),
    });
  }

  save(): void {
    const schema = this.schema();

    this.saving.set(true);
    this.saveErrors.set([]);

    this.api.saveSchema(schema).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open(`Formulaire « ${schema.title} » enregistré.`, 'OK', { duration: 3000 });
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

  copyJson(): void {
    navigator.clipboard.writeText(this.json()).then(
      () => this.snackBar.open('JSON copié.', 'OK', { duration: 2000 }),
      () => this.snackBar.open('Copie impossible.', 'OK', { duration: 2000 }),
    );
  }
}
