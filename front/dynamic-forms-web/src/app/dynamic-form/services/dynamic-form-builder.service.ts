import { inject, Injectable } from '@angular/core';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { FieldSchema } from '../models/form-schema.model';
import { ValidatorRegistryService } from './validator-registry.service';

/**
 * Construit l'arbre de contrôles Angular à partir du schéma JSON.
 *
 * La construction est récursive :
 *   - un champ simple  -> FormControl
 *   - un champ 'group' -> FormGroup    (contient ses `fields`)
 *   - un champ 'array' -> FormArray de FormGroup, un par ligne
 *
 * C'est ce qui donne les sous-formulaires et les listes répétables à profondeur
 * quelconque sans code supplémentaire par niveau.
 */
@Injectable({ providedIn: 'root' })
export class DynamicFormBuilderService {
  private readonly registry = inject(ValidatorRegistryService);

  /** Construit un FormGroup à partir d'une liste de champs. */
  buildGroup(fields: FieldSchema[]): FormGroup {
    const controls: Record<string, FormControl | FormGroup | FormArray> = {};

    for (const field of fields) {
      controls[field.name] = this.buildControl(field);
    }

    return new FormGroup(controls);
  }

  /**
   * Greffe les champs dans un FormGroup existant — celui que fournit l'application appelante.
   * C'est le point d'entrée du moteur : il ne crée jamais le formulaire, il le peuple.
   *
   * `setControl` et non `addControl` : la greffe doit être idempotente, car le schéma peut
   * être reconstruit (changement de schéma, aperçu du builder) sur le même groupe.
   */
  buildInto(parent: FormGroup, fields: FieldSchema[]): FormGroup {
    for (const field of fields) {
      parent.setControl(field.name, this.buildControl(field));
    }

    return parent;
  }

  /**
   * Construit une ligne de FormArray : un FormGroup avec les sous-champs du tableau.
   * Exposé publiquement car le composant array l'appelle sur "Ajouter".
   */
  buildArrayItem(field: FieldSchema): FormGroup {
    return this.buildGroup(field.fields ?? []);
  }

  private buildControl(field: FieldSchema): FormControl | FormGroup | FormArray {
    switch (field.type) {
      case 'group':
        return this.buildGroup(field.fields ?? []);

      case 'array': {
        const items = Array.from({ length: field.initialItems ?? 0 }, () =>
          this.buildArrayItem(field),
        );
        return new FormArray(items);
      }

      default:
        return new FormControl(
          { value: this.initialValueOf(field), disabled: field.disabled ?? false },
          { validators: this.registry.resolve(field.validators) },
        );
    }
  }

  private initialValueOf(field: FieldSchema): unknown {
    if (field.defaultValue !== undefined && field.defaultValue !== null) {
      return field.defaultValue;
    }

    // Une checkbox sans valeur par défaut doit démarrer décochée, pas nulle :
    // sinon `Validators.requiredTrue` et les conditions `falsy` se comportent mal.
    return field.type === 'checkbox' ? false : null;
  }

  /**
   * Applique une valeur existante sur le formulaire.
   * On ne peut pas se contenter de `patchValue` : les FormArray doivent d'abord
   * être dimensionnés au nombre de lignes reçues, sinon les lignes sont ignorées.
   */
  patch(group: FormGroup, fields: FieldSchema[], value: Record<string, unknown>): void {
    for (const field of fields) {
      const incoming = value[field.name];
      if (incoming === undefined) {
        continue;
      }

      const control = group.get(field.name);

      if (field.type === 'array' && control instanceof FormArray) {
        const rows = Array.isArray(incoming) ? incoming : [];
        control.clear();

        for (const row of rows) {
          const item = this.buildArrayItem(field);
          this.patch(item, field.fields ?? [], (row ?? {}) as Record<string, unknown>);
          control.push(item);
        }

        continue;
      }

      if (field.type === 'group' && control instanceof FormGroup) {
        this.patch(control, field.fields ?? [], (incoming ?? {}) as Record<string, unknown>);
        continue;
      }

      control?.patchValue(incoming);
    }
  }
}
