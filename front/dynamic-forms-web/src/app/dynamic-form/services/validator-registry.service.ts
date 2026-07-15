import { Injectable } from '@angular/core';
import { AbstractControl, ValidatorFn, Validators } from '@angular/forms';
import { ValidatorSchema } from '../models/form-schema.model';

/**
 * Fabrique un ValidatorFn à partir de l'argument déclaré dans le JSON.
 * `arg` vaut par exemple 5 pour min, "^[0-9]+$" pour pattern, et undefined pour required.
 */
export type ValidatorFactory = (arg: unknown) => ValidatorFn;

/**
 * Registre des validateurs adressables par clé depuis le schéma JSON.
 *
 * Le back envoie `{ "type": "matriculeFiscal" }` — il n'a jamais besoin de connaître
 * l'implémentation. C'est ici qu'on résout la clé en fonction de validation Angular.
 * Une application enregistre ses propres règles via `register()`.
 */
@Injectable({ providedIn: 'root' })
export class ValidatorRegistryService {
  private readonly factories = new Map<string, ValidatorFactory>();

  /** Message de repli quand le schéma n'en fournit pas. */
  private readonly defaultMessages = new Map<string, string>();

  constructor() {
    this.registerBuiltIns();
    this.registerCustoms();
  }

  /**
   * Enregistre (ou remplace) un validateur.
   * @param key clé utilisée dans le JSON — `{ "type": key }`
   */
  register(key: string, factory: ValidatorFactory, defaultMessage?: string): void {
    this.factories.set(key, factory);
    if (defaultMessage) {
      this.defaultMessages.set(key, defaultMessage);
    }
  }

  /** Résout la liste de validateurs d'un champ. Une clé inconnue est ignorée, pas fatale. */
  resolve(schemas: ValidatorSchema[] | undefined): ValidatorFn[] {
    if (!schemas?.length) {
      return [];
    }

    const validators: ValidatorFn[] = [];

    for (const schema of schemas) {
      const factory = this.factories.get(schema.type);

      if (!factory) {
        console.warn(`[ValidatorRegistry] validateur inconnu : "${schema.type}" — ignoré.`);
        continue;
      }

      validators.push(this.withMessage(factory(schema.value), schema));
    }

    return validators;
  }

  /**
   * Message à afficher pour la première erreur d'un contrôle.
   * On lit d'abord le message porté par l'erreur elle-même (posé par `withMessage`),
   * sinon on retombe sur le message par défaut du registre.
   */
  messageFor(control: AbstractControl): string | null {
    const errors = control.errors;
    if (!errors) {
      return null;
    }

    const [key, detail] = Object.entries(errors)[0];

    if (this.isMessageCarrier(detail)) {
      return detail.message;
    }

    return this.defaultMessages.get(key) ?? this.describe(key, detail);
  }

  /**
   * Enveloppe un validateur pour injecter le message du schéma dans l'objet d'erreur.
   * Sans ça, `Validators.min(5)` renvoie `{ min: { min: 5, actual: 3 } }` et le message
   * personnalisé du JSON serait perdu.
   */
  private withMessage(validator: ValidatorFn, schema: ValidatorSchema): ValidatorFn {
    if (!schema.message) {
      return validator;
    }

    return (control) => {
      const errors = validator(control);
      if (!errors) {
        return null;
      }

      const key = Object.keys(errors)[0];
      return { [key]: { ...this.asObject(errors[key]), message: schema.message } };
    };
  }

  // ---------------------------------------------------------------------------
  // Validateurs natifs Angular
  // ---------------------------------------------------------------------------

  private registerBuiltIns(): void {
    this.register('required', () => Validators.required, 'Ce champ est obligatoire.');
    this.register('requiredTrue', () => Validators.requiredTrue, 'Vous devez cocher cette case.');
    this.register('email', () => Validators.email, 'Adresse email invalide.');
    this.register('min', (arg) => Validators.min(Number(arg)));
    this.register('max', (arg) => Validators.max(Number(arg)));
    this.register('minLength', (arg) => Validators.minLength(Number(arg)));
    this.register('maxLength', (arg) => Validators.maxLength(Number(arg)));
    this.register('pattern', (arg) => Validators.pattern(String(arg)), 'Format invalide.');
  }

  // ---------------------------------------------------------------------------
  // Validateurs custom — l'exemple de ce qu'une application ajoute
  // ---------------------------------------------------------------------------

  private registerCustoms(): void {
    // Matricule fiscal tunisien : 7 chiffres, 1 lettre de contrôle, 3 codes, 3 chiffres.
    // Ex: 1234567A/M/000
    this.register(
      'matriculeFiscal',
      () => (control) => {
        const value = control.value;
        if (this.isEmpty(value)) {
          return null; // le "obligatoire" est le travail de `required`, pas du nôtre.
        }

        const ok = /^[0-9]{7}[A-Za-z]\/[A-Za-z]\/[0-9]{3}$/.test(String(value).trim());
        return ok ? null : { matriculeFiscal: true };
      },
      'Matricule fiscal invalide (format attendu : 1234567A/M/000).',
    );

    // Interdit les espaces en début/fin — utile sur les codes et références.
    this.register(
      'noSurroundingSpace',
      () => (control) => {
        const value = control.value;
        if (this.isEmpty(value) || typeof value !== 'string') {
          return null;
        }

        return value === value.trim() ? null : { noSurroundingSpace: true };
      },
      'Retirez les espaces en début ou en fin.',
    );
  }

  // ---------------------------------------------------------------------------

  private isEmpty(value: unknown): boolean {
    return value === null || value === undefined || value === '';
  }

  private isMessageCarrier(detail: unknown): detail is { message: string } {
    return (
      typeof detail === 'object' &&
      detail !== null &&
      'message' in detail &&
      typeof (detail as { message: unknown }).message === 'string'
    );
  }

  private asObject(detail: unknown): Record<string, unknown> {
    return typeof detail === 'object' && detail !== null
      ? (detail as Record<string, unknown>)
      : { value: detail };
  }

  /** Dernier recours : un message lisible construit depuis l'objet d'erreur d'Angular. */
  private describe(key: string, detail: unknown): string {
    const d = this.asObject(detail);

    switch (key) {
      case 'min':
        return `La valeur minimale est ${d['min']}.`;
      case 'max':
        return `La valeur maximale est ${d['max']}.`;
      case 'minlength':
        return `${d['requiredLength']} caractères minimum.`;
      case 'maxlength':
        return `${d['requiredLength']} caractères maximum.`;
      default:
        return 'Valeur invalide.';
    }
  }
}
