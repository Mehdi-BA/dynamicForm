import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, of, shareReplay } from 'rxjs';
import { FormSchema } from '../models/form-schema.model';

export interface FormSummary {
  id: string;
  title: string;
  description?: string;
}

export interface LookupItem {
  value: string;
  label: string;
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

  /** Cache par source : les référentiels d'autocomplete ne changent pas pendant la session. */
  private readonly lookupCache = new Map<string, Observable<LookupItem[]>>();

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

  /** Sources de lookup disponibles — proposées par le builder pour les champs autocomplete. */
  listLookupSources(): Observable<string[]> {
    return this.http.get<string[]>(`${API}/lookup`);
  }

  /**
   * Charge une source de lookup en entier, une seule fois.
   *
   * Le filtrage se fait ensuite côté client : ces référentiels sont petits (pays, villes),
   * et un appel réseau par frappe pour filtrer 18 pays serait du gaspillage. Pour une source
   * volumineuse il faudrait passer `q` au back — `searchLookup` ci-dessous fait exactement ça.
   */
  loadLookup(source: string): Observable<LookupItem[]> {
    if (!this.lookupCache.has(source)) {
      this.lookupCache.set(
        source,
        this.http.get<LookupItem[]>(`${API}/lookup/${source}`, { params: { take: 100 } }).pipe(
          shareReplay({ bufferSize: 1, refCount: false }),
        ),
      );
    }

    return this.lookupCache.get(source)!;
  }

  /** Recherche côté serveur — pour les référentiels trop gros pour être chargés en entier. */
  searchLookup(source: string, q: string): Observable<LookupItem[]> {
    if (!source) {
      return of([]);
    }

    return this.http.get<LookupItem[]>(`${API}/lookup/${source}`, { params: { q } });
  }
}
