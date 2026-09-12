// src/app/components/apify-data-grid/apify-data-grid.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-apify-data-grid',
  standalone: true,
  imports: [CommonModule],
  // Arquitectura Limpia: Archivos separados
  templateUrl: './apify-data-grid.component.html',
  styleUrl: './apify-data-grid.component.scss'
})
export class ApifyDataGridComponent {
  // Entradas de datos estrictas
  @Input({ required: true }) data: any[] = [];
  @Input({ required: true }) network: string = 'youtube';

  /**
   * Extrae el ID del video de YouTube desde su URL para generar
   * la imagen de portada (miniatura) dinámicamente.
   */
  getYouTubeId(url: string): string | null {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  /**
   * Fallback de UI: Si la miniatura de máxima resolución (maxresdefault) no existe
   * en el canal, pedimos la miniatura estándar de alta calidad (hqdefault).
   */
  handleImageError(event: any, videoId: string | null) {
    if (videoId && event.target.src.includes('maxresdefault')) {
      event.target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
  }

  /**
   * Adapter: Deducimos el nombre de la marca/canal sin importar de qué scraper provenga.
   */
  getAuthorName(item: any): string {
    return item.channelName || item.authorMeta?.name || item.pageName || item.ownerUsername || 'Competidor';
  }
}
