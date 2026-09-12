// src/app/components/apify-runs-table/apify-runs-table.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ApifyRunRecord } from '../../services/apify.service';

@Component({
  selector: 'app-apify-runs-table',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './apify-runs-table.component.html',
  styleUrl: './apify-runs-table.component.scss'
})
export class ApifyRunsTableComponent {

  @Input({ required: true }) runsList: ApifyRunRecord[] = [];
  @Output() runSelected = new EventEmitter<{runId: string, actorInternalId: string}>();

  // ==========================================
  // MAPPER VISUAL DE PLATAFORMAS (Adapter Pattern)
  // ==========================================
  getActorFriendlyName(actorId: string): string {
    const platformMapping: Record<string, string> = {
      // Facebook
      'KoJrdxJCTtpon81KY': 'Facebook (Páginas)',
      'apify/facebook-posts-scraper': 'Facebook (Páginas)',

      // Instagram
      'shu8hvrXbJbY3Eb9W': 'Instagram (Perfiles)',
      'apify/instagram-scraper': 'Instagram (Perfiles)',

      // TikTok
      'GdWCkxBtKWOsKjdch': 'TikTok (Búsqueda)',
      'clockworks/tiktok-scraper': 'TikTok (Búsqueda)',
      '0FXVyOXXEmdGcV88a': 'TikTok (Perfiles)',
      'clockworks/tiktok-profile-scraper': 'TikTok (Perfiles)',

      // YouTube
      'h7sDV53CddomktSi5': 'YouTube (Canales)',
      'streamers/youtube-scraper': 'YouTube (Canales)'
    };

    return platformMapping[actorId] || actorId;
  }

  // FIX: Renombrado de onSelectRun a onRowClick para coincidir con tu HTML
  onRowClick(runId: string, actorId: string) {
    this.runSelected.emit({ runId, actorInternalId: actorId });
  }
}
