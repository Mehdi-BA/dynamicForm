import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatToolbarModule } from '@angular/material/toolbar';
import { RouterLink } from '@angular/router';
import { DynamicFormComponent } from '../dynamic-form/components/dynamic-form.component';
import { FormSchema } from '../dynamic-form/models/form-schema.model';
import { FormApiService, FormSummary } from '../dynamic-form/services/form-api.service';

/**
 * Démo du moteur : on choisit un formulaire, on charge son schéma depuis l'API,
 * et `<app-dynamic-form>` le rend. Aucune connaissance des champs ici.
 */
@Component({
  selector: 'app-form-demo',
  standalone: true,
  imports: [
    RouterLink,
    DynamicFormComponent,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './form-demo.component.html',
  styleUrl: './form-demo.component.scss',
})
export class FormDemoComponent {
  private readonly api = inject(FormApiService);
  private readonly snackBar = inject(MatSnackBar);

  readonly forms = signal<FormSummary[]>([]);
  readonly selectedId = signal<string | null>(null);
  readonly schema = signal<FormSchema | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.api.listForms().subscribe({
      next: (forms) => {
        this.forms.set(forms);
        this.selectedId.set(forms[0]?.id ?? null);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(
          "Impossible de joindre l'API. Démarrez le back : dotnet run --project back/DynamicForms.Api",
        );
        this.loading.set(false);
      },
    });

    // Charger le schéma dès que la sélection change.
    effect(() => {
      const id = this.selectedId();
      if (!id) {
        return;
      }

      this.loading.set(true);
      this.schema.set(null);

      this.api.getSchema(id).subscribe({
        next: (schema) => {
          this.schema.set(schema);
          this.loading.set(false);
        },
        error: () => {
          this.error.set(`Schéma "${id}" introuvable.`);
          this.loading.set(false);
        },
      });
    });
  }

  onSelect(id: string): void {
    this.selectedId.set(id);
  }

  onSubmitted(value: Record<string, unknown>): void {
    const id = this.selectedId();
    if (!id) {
      return;
    }

    this.api.submit(id, value).subscribe({
      next: () => this.snackBar.open('Formulaire envoyé au back.', 'OK', { duration: 3000 }),
      error: () => this.snackBar.open("Échec de l'envoi.", 'OK', { duration: 3000 }),
    });
  }
}
