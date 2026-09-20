// src/app/components/apify-runs-table/apify-runs-table.component.ts
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApifyRunRecord } from '../../services/apify.service';

@Component({
  selector: 'app-apify-runs-table',
  standalone: true,
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './apify-runs-table.component.html',
  styleUrl: './apify-runs-table.component.scss'
})
export class ApifyRunsTableComponent {
  @Input() runsList: ApifyRunRecord[] = [];

  // NUEVO: Bandera de seguridad para gobernanza de datos (RBAC)
  // En un sistema real, esto vendría de tu servicio de Autenticación (ej. Supabase Auth)
  @Input() isAdmin: boolean = false;

  @Output() runSelected = new EventEmitter<{runId: string, actorInternalId: string}>();
  @Output() countryChanged = new EventEmitter<{runId: string, newCountry: string}>();

  getPlatformName(actorId: string): string {
    if (actorId.includes('facebook-posts') || actorId === 'KoJrdxJCTtpon81KY') return 'Facebook (Posts)';
    if (actorId.includes('facebook-pages') || actorId === '4Hv5RhChiaDk6iwad') return 'Facebook (Pages)';
    if (actorId.includes('instagram') || actorId === 'shu8hvrXbJbY3Eb9W') return 'Instagram (Perfiles)';
    if (actorId.includes('tiktok-profile') || actorId === 'clockworks/tiktok-profile-scraper') return 'TikTok (Perfiles)';
    if (actorId.includes('tiktok') || actorId === 'GdWCkxBtKWOsKjdch' || actorId === '0FXVyOXXEmdGcV88a') return 'TikTok';
    if (actorId.includes('youtube') || actorId === 'h7sDV53CddomktSi5') return 'YouTube (Canales)';
    if (actorId === 'Facebook (Consolidado)') return 'Facebook (Consolidado)';
    return actorId;
  }

  getDuration(startedAt: string, finishedAt: string): string {
    if (!startedAt || !finishedAt) return '-';
    const start = new Date(startedAt).getTime();
    const end = new Date(finishedAt).getTime();
    const diff = Math.abs(end - start);
    const minutes = Math.floor(diff / 60000);
    const seconds = ((diff % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }

  onSelectRun(run: ApifyRunRecord) {
    if (run.status !== 'SUCCEEDED' && !run.id.startsWith('HYBRID')) return;
    this.runSelected.emit({ runId: run.id, actorInternalId: run.actorId });
  }

  onCountryChange(runId: string, event: Event) {
    // Medida de seguridad adicional por si logran vulnerar el DOM
    if (!this.isAdmin) {
      console.warn('Acceso denegado: Solo los administradores pueden alterar la procedencia de los datos.');
      return;
    }

    event.stopPropagation();
    const selectElement = event.target as HTMLSelectElement;
    this.countryChanged.emit({ runId, newCountry: selectElement.value });
  }
}
