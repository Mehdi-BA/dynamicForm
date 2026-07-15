import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable, shareReplay } from 'rxjs';
import { FormSchema, Resource, ResourceOption } from '../models/form-schema.model';

export interface FormSummary {
  id: string;
  title: string;
  description?: string;
}

export interface SubmitResult {
  formId: string;
  receivedAt: string;
  data: unknown;
}

const API = 'http://localhost:5244/api';

@Injectable({ providedIn: 'root' })
export class FormApiService {
  private readonly http = inject(HttpClient);

  /** Cache par id : une ressource ne change pas pendant l'exécution d'un formulaire. */
  private readonly resourceCache = new Map<string, Observable<Resource>>();

  listForms(): Observable<FormSummary[]> {
    return this.http.get<FormSummary[]>(`${API}/forms`);
  }

  getSchema(id: string): Observable<FormSchema> {
    return this.http.get<FormSchema>(`${API}/forms/${id}`);
  }

  submit(id: string, data: unknown): Observable<SubmitResult> {
    return this.http.post<SubmitResult>(`${API}/forms/${id}/submit`, data);
  }

  /** Enregistre un schéma construit par le form builder. Le back le valide avant d'accepter. */
  saveSchema(schema: FormSchema): Observable<FormSchema> {
    return this.http.put<FormSchema>(`${API}/forms/${schema.id}`, schema);
  }

  deleteSchema(id: string): Observable<void> {
    return this.http.delete<void>(`${API}/forms/${id}`);
  }

  // ---------------------------------------------------------------------------
  // Ressources (data sources) — CRUD, géré par l'onglet « Data Source » du builder
  // ---------------------------------------------------------------------------

  /** Liste complète des ressources : le builder a besoin de l'objet entier (url, mapping…). */
  listResources(): Observable<Resource[]> {
    return this.http.get<Resource[]>(`${API}/resources`);
  }

  /** Charge une ressource, une seule fois : elle ne change pas pendant l'exécution d'un form. */
  getResource(id: string): Observable<Resource> {
    if (!this.resourceCache.has(id)) {
      this.resourceCache.set(
        id,
        this.http.get<Resource>(`${API}/resources/${id}`).pipe(
          shareReplay({ bufferSize: 1, refCount: false }),
        ),
      );
    }

    return this.resourceCache.get(id)!;
  }

  saveResource(resource: Resource): Observable<Resource> {
    // Le cache pointerait sur l'ancienne version.
    this.resourceCache.delete(resource.id);
    return this.http.put<Resource>(`${API}/resources/${resource.id}`, resource);
  }

  deleteResource(id: string): Observable<void> {
    this.resourceCache.delete(id);
    return this.http.delete<void>(`${API}/resources/${id}`);
  }

  /**
   * Exécute une ressource côté front : construit la requête depuis `url` + `params`, appelle
   * l'API (le back ne fait pas de proxy), puis mappe chaque ligne de la réponse en option.
   *
   * Convention : le paramètre nommé `q` reçoit la saisie utilisateur ; les autres prennent
   * leur `defaultValue`. La réponse attendue est un tableau d'objets ; toute autre forme
   * dégrade proprement en liste vide.
   */
  executeResource(resource: Resource, q?: string): Observable<ResourceOption[]> {
    let params = new HttpParams();

    for (const p of resource.params ?? []) {
      const value = p.name === 'q' ? (q ?? '') : p.defaultValue;
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(p.name, value);
      }
    }

    return this.http.get<unknown>(resource.url, { params }).pipe(
      map((rows) => (Array.isArray(rows) ? rows : [])),
      map((rows) => rows.map((row) => this.mapRow(row, resource.mapping))),
    );
  }

  private mapRow(row: unknown, mapping: Resource['mapping']): ResourceOption {
    const record = (row ?? {}) as Record<string, unknown>;

    const extra: Record<string, unknown> = {};
    for (const field of mapping.extraFields ?? []) {
      extra[field] = record[field];
    }

    return {
      value: String(record[mapping.valueField] ?? ''),
      label: String(record[mapping.labelField] ?? ''),
      extra,
    };
  }
}
