// src/app/components/apify-data-grid/apify-data-grid.component.ts
import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-apify-data-grid',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './apify-data-grid.component.html',
  styleUrl: './apify-data-grid.component.scss'
})
export class ApifyDataGridComponent {
  @Input({ required: true }) data: any[] = [];
  @Input({ required: true }) network: string = 'youtube';

  getYouTubeId(url: string): string | null {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  }

  handleImageError(event: any, videoId: string | null) {
    if (videoId && event.target.src.includes('maxresdefault')) {
      event.target.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    }
  }

  // ==========================================
  // ADAPTERS DE NORMALIZACIÓN DE DATOS
  // ==========================================

  getAuthorName(item: any): string {
    // Agregamos ownerFullName como prioridad para Instagram
    return item.ownerFullName || item.channelName || item.pageName || item.authorMeta?.name || item.ownerUsername || item.user?.name || 'Competidor';
  }

  getMediaThumbnail(item: any): string | null {
    if (this.network === 'youtube') {
      if (item.thumbnailUrl) return item.thumbnailUrl;
      const id = this.getYouTubeId(item.url);
      return id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : null;
    }

    if (this.network === 'facebook') {
      if (item.media && Array.isArray(item.media)) {
        const validMedia = item.media.find((m: any) => m.thumbnail || m.image?.uri || m.photo_image?.uri);
        if (validMedia) {
          return validMedia.thumbnail || validMedia.image?.uri || validMedia.photo_image?.uri;
        }
      }
      return null;
    }

    if (this.network === 'instagram') {
      // Instagram siempre entrega displayUrl como la mejor resolución de la portada
      return item.displayUrl || item.thumbnailUrl || item.imageUrl || null;
    }

    if (this.network === 'tiktok') {
      return item.videoMeta?.coverUrl || item.authorMeta?.avatar || item.imageUrl || null;
    }

    return null;
  }

  getPostTitle(item: any): string {
    // Priorizamos 'caption' que es el estándar en Instagram
    if (item.caption) return item.caption;
    if (item.title) return item.title;
    if (item.text) return item.text;

    // Edge case Facebook
    if (this.network === 'facebook' && item.media && item.media.length > 0) {
      const firstMedia = item.media[0];
      const errorText = firstMedia.title_with_entities?.text || '';
      if (errorText.includes("isn't available") || errorText.includes("no está disponible") || errorText.includes("deleted")) {
        return '🚫 Contenido no disponible (Privado o Eliminado)';
      }
    }

    return 'Contenido visual sin texto descriptivo';
  }

  getPostDate(item: any): Date {
    const rawDate = item.timestamp || item.time || item.date || item.createTimeISO || item.createdAt;
    if (item.createTime && typeof item.createTime === 'number') {
       return new Date(item.createTime * 1000);
    }
    if (typeof rawDate === 'number' && rawDate < 10000000000) {
      return new Date(rawDate * 1000);
    }
    return rawDate ? new Date(rawDate) : new Date();
  }

  /**
   * NUEVO: Formateador unificado de duración para YouTube, TikTok e Instagram Reels
   */
  getFormattedDuration(item: any): string | null {
    if (this.network === 'youtube' && item.duration) return item.duration;

    let seconds = 0;
    if (this.network === 'tiktok' && item.videoMeta?.duration) {
      seconds = item.videoMeta.duration; // TikTok envía segundos enteros
    } else if (this.network === 'instagram' && item.videoDuration) {
      seconds = Math.round(item.videoDuration); // Instagram envía decimales (ej. 41.27)
    } else {
      return null;
    }

    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
}
