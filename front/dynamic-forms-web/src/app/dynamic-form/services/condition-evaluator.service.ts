import { Injectable } from '@angular/core';
import { ConditionSchema } from '../models/form-schema.model';

/**
 * Évalue les conditions `visibleIf` du schéma contre la valeur courante du formulaire.
 *
 * Le schéma décrit la condition en données (field / op / value, and / or) plutôt qu'en
 * expression JavaScript : pas d'`eval`, donc rien d'exécutable ne transite par l'API,
 * et la condition reste inspectable et testable.
 */
@Injectable({ providedIn: 'root' })
export class ConditionEvaluatorService {
  /**
   * @param condition la condition du champ (absente = toujours visible)
   * @param rootValue la valeur du FormGroup racine — les chemins sont résolus depuis là
   */
  evaluate(condition: ConditionSchema | undefined, rootValue: unknown): boolean {
    if (!condition) {
      return true;
    }

    if (condition.and?.length) {
      return condition.and.every((c) => this.evaluate(c, rootValue));
    }

    if (condition.or?.length) {
      return condition.or.some((c) => this.evaluate(c, rootValue));
    }

    if (!condition.field) {
      // Ni noeud logique ni feuille exploitable : on ne masque pas sur une condition vide.
      return true;
    }

    const actual = this.readPath(rootValue, condition.field);
    return this.compare(actual, condition.op ?? 'truthy', condition.value);
  }

  /** Liste les chemins observés par une condition, pour savoir quand la réévaluer. */
  dependencies(condition: ConditionSchema | undefined, into = new Set<string>()): Set<string> {
    if (!condition) {
      return into;
    }

    if (condition.field) {
      into.add(condition.field);
    }

    condition.and?.forEach((c) => this.dependencies(c, into));
    condition.or?.forEach((c) => this.dependencies(c, into));

    return into;
  }

  private compare(actual: unknown, op: string, expected: unknown): boolean {
    switch (op) {
      case 'eq':
        return this.looseEquals(actual, expected);
      case 'neq':
        return !this.looseEquals(actual, expected);
      case 'in':
        return Array.isArray(expected) && expected.some((e) => this.looseEquals(actual, e));
      case 'notIn':
        return !Array.isArray(expected) || !expected.some((e) => this.looseEquals(actual, e));
      case 'gt':
        return Number(actual) > Number(expected);
      case 'gte':
        return Number(actual) >= Number(expected);
      case 'lt':
        return Number(actual) < Number(expected);
      case 'lte':
        return Number(actual) <= Number(expected);
      case 'truthy':
        return this.isTruthy(actual);
      case 'falsy':
        return !this.isTruthy(actual);
      default:
        console.warn(`[ConditionEvaluator] opérateur inconnu : "${op}" — condition ignorée.`);
        return true;
    }
  }

  /**
   * Comparaison tolérante au type : le JSON envoie "19" là où le champ number porte 19,
   * et une checkbox non touchée porte `null` là où le schéma attend `false`.
   */
  private looseEquals(a: unknown, b: unknown): boolean {
    if (a === b) {
      return true;
    }

    if (a === null || a === undefined || b === null || b === undefined) {
      return false;
    }

    return String(a) === String(b);
  }

  private isTruthy(value: unknown): boolean {
    if (Array.isArray(value)) {
      return value.length > 0;
    }

    return !!value;
  }

  /** Résout 'adresse.pays' ou 'contacts.0.email' dans la valeur du formulaire. */
  private readPath(root: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc === null || acc === undefined) {
        return undefined;
      }

      return (acc as Record<string, unknown>)[key];
    }, root);
  }
}
