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
    return item.channelName || item.pageName || item.authorMeta?.name || item.ownerUsername || item.user?.name || 'Competidor';
  }

  getMediaThumbnail(item: any): string | null {
    if (this.network === 'youtube') {
      // Priorizamos la URL de miniatura directa que devuelve Apify si existe
      if (item.thumbnailUrl) return item.thumbnailUrl;
      // Fallback a extraerla del ID del video
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
      return item.displayUrl || item.thumbnailUrl || item.imageUrl || null;
    }

    if (this.network === 'tiktok') {
      return item.videoMeta?.coverUrl || item.imageUrl || null;
    }

    return null;
  }

  getPostTitle(item: any): string {
    if (item.title) return item.title;
    if (item.text) return item.text;
    if (item.caption) return item.caption;

    // Edge case de privacidad en Facebook
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
    const rawDate = item.time || item.date || item.timestamp || item.createdAt;
    if (typeof rawDate === 'number' && rawDate < 10000000000) {
      return new Date(rawDate * 1000);
    }
    return rawDate ? new Date(rawDate) : new Date();
  }
}
