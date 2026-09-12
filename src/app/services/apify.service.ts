// src/app/services/apify.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export type ApifyAction = 'run' | 'get-latest' | 'list-runs' | 'get-run-data';

// 1. ACTUALIZACIÓN: Agregamos actorId para identificar de qué red social es cada historial
export interface ApifyRunRecord {
  id: string;
  status: string;
  startedAt: string;
  finishedAt: string;
  usageTotalUsd: number;
  actorId: string; // <-- Nueva propiedad mapeada desde el Backend
}

export interface ApifyPayload {
  action?: ApifyAction;
  actorId?: string; // Lo hacemos opcional porque 'list-runs' global ya no lo exige estrictamente
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
  // Reemplaza esto con la URL real de tu Edge Function si cambió, o mantenla igual
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
}
