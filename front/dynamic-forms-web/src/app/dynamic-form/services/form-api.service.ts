import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of } from 'rxjs';
import { FormSchema } from '../models/form-schema.model';

export interface FormSummary {
  id: string;
  title: string;
  description?: string;
}

export interface LookupItem {
  value: string;
  label: string;
  raw?: Record<string, unknown>;
}

interface ReferentialItem {
  key: string;
  value: string;
}

export interface LookupFromUrlConfig {
  lookupUrl: string;
  lookupKeyField?: string;
  lookupValueField?: string;
  lookupQueryParam?: string;
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

  /** Recherche côté serveur via source interne key/value. */
  searchLookupBySource(source: string, q: string): Observable<LookupItem[]> {
    if (!source) {
      return of([]);
    }

    return this.http
      .get<ReferentialItem[]>(`${API}/referentials/${source}/search`, { params: { q } })
      .pipe(
        map((items) =>
          items.map((item) => ({ value: item.key, label: item.value, raw: { key: item.key, value: item.value } })),
        ),
      );
  }

  /** Recherche côté serveur via URL paramétrée dans le schéma. */
  searchLookupByUrl(config: LookupFromUrlConfig, q: string): Observable<LookupItem[]> {
    const lookupUrl = config.lookupUrl?.trim();

    if (!lookupUrl) {
      return of([]);
    }

    const keyField = (config.lookupKeyField || 'key').trim();
    const valueField = (config.lookupValueField || 'value').trim();
    const queryParam = (config.lookupQueryParam || 'q').trim();

    const params = queryParam ? { [queryParam]: q } : {};

    return this.http.get<Record<string, unknown>[]>(this.toAbsoluteUrl(lookupUrl), { params }).pipe(
      map((rows) =>
        rows
          .map((row) => ({
            value: String(row[keyField] ?? ''),
            label: String(row[valueField] ?? ''),
            raw: row,
          }))
          .filter((item) => !!item.value && !!item.label),
      ),
      catchError(() => of([])),
    );
  }

  /** Résout un code en libellé via l'API référentiel key/value interne. */
  resolveLookupBySource(source: string, key: string): Observable<LookupItem | null> {
    if (!source || !key) {
      return of(null);
    }

    return this.http.get<ReferentialItem>(`${API}/referentials/${source}/${encodeURIComponent(key)}`).pipe(
      map((item) => ({ value: item.key, label: item.value, raw: { key: item.key, value: item.value } })),
      catchError(() => of(null)),
    );
  }

  private toAbsoluteUrl(url: string): string {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }

    const normalized = url.startsWith('/') ? url : `/${url}`;
    return `http://localhost:5244${normalized}`;
  }
}
