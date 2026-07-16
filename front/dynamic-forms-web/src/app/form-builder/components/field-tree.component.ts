import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDragPlaceholder,
  CdkDropList,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FieldDefinition, FieldSchema } from '../../dynamic-form/models/form-schema.model';
import { BuilderStateService, FieldPath, TYPE_ICONS } from '../services/builder-state.service';

/**
 * Arbre des champs du builder.
 *
 * Récursif, comme le moteur : un `group` ou un `array` re-rend `<app-field-tree>` pour
 * ses sous-champs. Chaque niveau est sa propre zone de drop, donc on réordonne à
 * l'intérieur d'un conteneur sans que le champ puisse en sortir par accident.
 */
@Component({
  selector: 'app-field-tree',
  standalone: true,
  imports: [
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkDragPlaceholder,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './field-tree.component.html',
  styleUrl: './field-tree.component.scss',
})
export class FieldTreeComponent {
  readonly fields = input.required<FieldSchema[]>();

  /** Chemin du conteneur qui porte ces champs. Vide = racine. */
  readonly parentPath = input<FieldPath>([]);

  /**
   * La bibliothèque, pour le menu « + » des conteneurs. Passée en input et propagée à chaque
   * niveau de l'arbre : la charger dans chaque nœud multiplierait les appels réseau.
   */
  readonly library = input<FieldDefinition[]>([]);

  readonly state = inject(BuilderStateService);

  pathOf(index: number): FieldPath {
    return [...this.parentPath(), index];
  }

  /** Le champ posé est indépendant de la bibliothèque : son type est la seule info sûre. */
  iconFor(field: FieldSchema): string {
    return TYPE_ICONS[field.type] ?? 'help_outline';
  }

  isContainer(field: FieldSchema): boolean {
    return field.type === 'group' || field.type === 'array';
  }

  /** Les sous-champs, ou null si le conteneur est vide — le template s'en sert comme garde. */
  childrenOf(field: FieldSchema): FieldSchema[] | null {
    return field.fields?.length ? field.fields : null;
  }

  onDrop(event: CdkDragDrop<FieldSchema[]>): void {
    // moveItemInArray n'est pas appelé sur le tableau du signal : le state est la source
    // de vérité et se charge du clone. Sans ça on muterait le schéma en place.
    this.state.moveField(this.parentPath(), event.previousIndex, event.currentIndex);
  }

  /** Résumé affiché sous le nom : ce qui distingue ce champ des autres. */
  summaryOf(field: FieldSchema): string {
    const parts: string[] = [field.type];

    if (field.validators?.some((v) => v.type === 'required')) {
      parts.push('obligatoire');
    }

    if (field.visibleIf) {
      parts.push('conditionnel');
    }

    if (this.isContainer(field)) {
      const count = field.fields?.length ?? 0;
      parts.push(count === 0 ? 'vide' : `${count} champ${count > 1 ? 's' : ''}`);
    }

    return parts.join(' · ');
  }

  /** Empêche le clic sur une action de sélectionner aussi le champ. */
  stop(event: Event): void {
    event.stopPropagation();
  }
}
