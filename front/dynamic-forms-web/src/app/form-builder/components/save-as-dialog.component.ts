import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface SaveAsDialogData {
  title: string;
  id: string;
}

export interface SaveAsDialogResult {
  title: string;
  id: string;
}

@Component({
  selector: 'app-save-as-dialog',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 mat-dialog-title>Enregistrer sous</h2>

    <mat-dialog-content class="save-as-dialog__content">
      <mat-form-field appearance="outline">
        <mat-label>Titre du template</mat-label>
        <input matInput [ngModel]="title()" (ngModelChange)="title.set($event)" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>Identifiant du template</mat-label>
        <input matInput [ngModel]="id()" (ngModelChange)="id.set($event)" />
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close()">Annuler</button>
      <button mat-flat-button type="button" [disabled]="!canSave()" (click)="save()">Créer</button>
    </mat-dialog-actions>
  `,
  styles: `
    .save-as-dialog__content {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-width: 420px;
      padding-top: 0.5rem;
    }

    @media (max-width: 600px) {
      .save-as-dialog__content {
        min-width: 0;
      }
    }
  `,
})
export class SaveAsDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<SaveAsDialogComponent, SaveAsDialogResult | undefined>);
  private readonly data = inject<SaveAsDialogData>(MAT_DIALOG_DATA);

  readonly title = signal(this.data.title);
  readonly id = signal(this.data.id);

  canSave(): boolean {
    return !!this.title().trim() && !!this.id().trim();
  }

  close(): void {
    this.dialogRef.close();
  }

  save(): void {
    this.dialogRef.close({
      title: this.title().trim(),
      id: this.id().trim(),
    });
  }
}
