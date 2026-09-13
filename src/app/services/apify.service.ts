// src/app/services/apify.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export type ApifyAction = 'run' | 'get-latest' | 'list-runs' | 'get-run-data';

export interface ApifyRunRecord {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  usageTotalUsd: number;
  actorId: string;
}

export interface ApifyPayload {
  action?: ApifyAction;
  actorId?: string;
  inputPayload?: Record<string, any>;
  runId?: string;
}

export interface ApifyResponse<T = any> {
  success: boolean;
  data?: T[];
  runId?: string;
  action?: ApifyAction;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ApifyService {
  private http = inject(HttpClient);

  // URL de la Edge Function en Supabase
  private readonly EDGE_FUNCTION_URL = 'https://mhfablbqwbjjgkmoyipd.supabase.co/functions/v1/apify-runner';

  executeScraper<T = any>(payload: ApifyPayload): Observable<ApifyResponse<T>> {
    return this.http.post<ApifyResponse<T>>(this.EDGE_FUNCTION_URL, payload).pipe(
      catchError(this.handleError)
    );
  }

  private handleError(error: HttpErrorResponse) {
    let errorMessage = 'Ocurrió un error desconocido de red.';

    if (error.error instanceof ErrorEvent) {
      errorMessage = `Error del cliente: ${error.error.message}`;
    } else {
      errorMessage = error.error?.error || `Error del servidor: código ${error.status}`;
    }

    console.error('[ApifyService Error]:', errorMessage);
    return throwError(() => new Error(errorMessage));
  }

  // ==========================================
  // CARGA OMNICANAL EN PARALELO (MASTER GRAPH)
  // ==========================================
  getOmnichannelLatestData(): Observable<any[]> {

    // FIX: Actualización de los IDs estáticos por los nuevos scrapers de Perfiles y Páginas.
    // Esto asegura que Supabase traiga las ejecuciones que realmente contienen los Seguidores/Suscriptores.
    const actors = [
      { net: 'facebook', id: '4Hv5RhChiaDk6iwad' },       // Scraper de Páginas de FB
      { net: 'tiktok', id: '0FXVyOXXEmdGcV88a' },         // Scraper de Perfiles de TikTok
      { net: 'instagram', id: 'apify/instagram-scraper' },// Scraper de Perfiles de Instagram
      { net: 'youtube', id: 'streamers/youtube-scraper' } // Scraper de Canales de YouTube
    ];

    const requests = actors.map(actor =>
      this.executeScraper({ action: 'get-latest', actorId: actor.id }).pipe(
        map(response => {
          if (response.success && Array.isArray(response.data)) {
            return response.data.map(item => ({ ...item, __network: actor.net }));
          }
          return [];
        }),
        catchError(err => {
          console.error(`[ApifyService] Error cargando data de ${actor.net}:`, err);
          return of([]);
        })
      )
    );

    return forkJoin(requests).pipe(
      map(results => results.flat())
    );
  }
}
