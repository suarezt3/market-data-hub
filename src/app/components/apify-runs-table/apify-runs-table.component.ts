// src/app/components/apify-runs-table/apify-runs-table.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common'; // Necesario para DatePipe y CurrencyPipe en la vista
import { ApifyRunRecord } from '../../services/apify.service';

@Component({
  selector: 'app-apify-runs-table',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './apify-runs-table.component.html',
  styleUrl: './apify-runs-table.component.scss'
})
export class ApifyRunsTableComponent {
  // 1. Recibe los datos desde el Smart Component (apify-viewer)
  @Input({ required: true }) runsList: ApifyRunRecord[] = [];

  // 2. Emite un evento hacia arriba cuando el usuario selecciona un historial
  @Output() runSelected = new EventEmitter<{ runId: string, actorInternalId: string }>();

  /**
   * Manejador del evento clic en la fila de la tabla.
   * Envía el ID de la ejecución y el ID del scraper al componente padre.
   */
  onRowClick(runId: string, actorId: string) {
    this.runSelected.emit({ runId, actorInternalId: actorId });
  }

  /**
   * Helper de Presentación (UX): Traduce el ID interno alfanumérico a un nombre ejecutivo.
   * Lo movemos aquí porque es estrictamente lógica de presentación visual para la tabla.
   */
  getActorFriendlyName(actorInternalId: string): string {
    const names: Record<string, string> = {
      'KoJrdxJCTtpon81KY': 'Facebook (Páginas)',
      'shu8hvrXbJbY3Eb9W': 'Instagram (Perfiles)',
      'GdWCkxBtKWOsKjdch': 'TikTok (Perfiles)',
      'h7sDV53CddomktSi5': 'YouTube (Canales)',
      'nFJndFXA5zjCTuudP': 'Búsqueda de Google'
    };
    return names[actorInternalId] || actorInternalId;
  }
}
