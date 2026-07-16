import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
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
 *
 * Un schéma marqué `kind: 'fragment'` n'est pas autonome : il est rendu à l'intérieur du
 * formulaire hôte ci-dessous (`hostForm`), qui fournit le FormGroup, porte ses propres
 * champs et pilote la validation et l'envoi.
 */
@Component({
  selector: 'app-form-demo',
  standalone: true,
  imports: [
    RouterLink,
    JsonPipe,
    ReactiveFormsModule,
    DynamicFormComponent,
    MatToolbarModule,
    MatCardModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
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

  /** Le schéma sélectionné est-il un fragment ? Alors il faut un formulaire hôte. */
  readonly isFragment = computed(() => this.schema()?.kind === 'fragment');

  /**
   * Le formulaire de l'application hôte : il porte ses propres champs (`reference`) et
   * accueille les champs du fragment sous `details`. C'est lui qui valide et qui envoie —
   * le fragment ne fait qu'y greffer ses contrôles.
   */
  readonly hostForm = new FormGroup({
    reference: new FormControl('', Validators.required),
  });

  /** Valeur de l'hôte, fragment inclus — pour montrer que la greffe remonte bien. */
  readonly hostValue = signal<unknown>({});

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

    // Suivre la valeur de l'hôte : les champs greffés par le fragment y apparaissent.
    this.hostForm.valueChanges.subscribe(() => this.hostValue.set(this.hostForm.value));
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

  /**
   * Envoi piloté par l'hôte : c'est l'hôte qui décide, avec sa propre validation — celle du
   * fragment y est incluse, puisque ses contrôles vivent dans `hostForm`.
   */
  onHostSubmit(): void {
    if (this.hostForm.invalid) {
      this.hostForm.markAllAsTouched();
      return;
    }

    this.onSubmitted(this.hostForm.value as Record<string, unknown>);
  }
}
