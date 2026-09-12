// src/app/components/apify-viewer/apify-viewer.component.ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';
import { ApifyService, ApifyPayload, ApifyAction, ApifyRunRecord } from '../../services/apify.service';

// 1. IMPORTAMOS NUESTRO NUEVO SERVICIO DE LÓGICA DE GRÁFICAS
import { ApifyChartService } from '../../services/apify-chart.service';

import { ApifyDataGridComponent } from '../apify-data-grid/apify-data-grid.component';
import { ApifyRunsTableComponent } from '../apify-runs-table/apify-runs-table.component';

@Component({
  selector: 'app-apify-viewer',
  standalone: true,
  imports: [
    FormsModule,
    NgxEchartsDirective,
    ApifyDataGridComponent,
    ApifyRunsTableComponent
  ],
  templateUrl: './apify-viewer.component.html',
  styleUrl: './apify-viewer.component.scss'
})
export class ApifyViewerComponent {
  private apifyService = inject(ApifyService);
  // 2. INYECTAMOS EL SERVICIO DE GRÁFICAS
  private apifyChartService = inject(ApifyChartService);

  // Estados reactivos
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  data = signal<any[]>([]);
  chartOptions = signal<EChartsOption | null>(null);
  runsList = signal<ApifyRunRecord[]>([]);

  // Formulario
  selectedNetwork = signal<string>('youtube');
  actionType = signal<ApifyAction>('get-latest');
  targetUrlsInput = signal<string>('');
  resultsLimit = signal<number>(30);
  scrapeType = signal<string>('posts');

  private readonly ACTORS_MAP: Record<string, string> = {
    'facebook': 'apify/facebook-posts-scraper',
    'instagram': 'apify/instagram-scraper',
    'tiktok': 'clockworks/tiktok-scraper',
    'youtube': 'streamers/youtube-scraper'
  };

  fetchData() {
    const rawUrls = this.targetUrlsInput()
      .split('\n')
      .map(u => u.trim())
      .filter(u => u !== '');

    if (rawUrls.length === 0 && this.actionType() === 'run') {
      this.error.set('Por favor, ingresa al menos una URL válida.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);
    this.data.set([]);
    this.chartOptions.set(null);
    this.runsList.set([]);

    const network = this.selectedNetwork();

    const payload: ApifyPayload = {
      action: this.actionType(),
      actorId: this.ACTORS_MAP[network]
    };

    if (this.actionType() === 'run') {
      payload.inputPayload = this.buildInputPayload(network, rawUrls);
    }

    this.apifyService.executeScraper(payload).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          if (this.actionType() === 'list-runs') {
            console.log('[Debug Apify] Lista de Runs (Historiales):', response.data);
            this.runsList.set(response.data as ApifyRunRecord[]);
          } else {
            console.log('[Debug Apify] Datos extraídos del Scraper:', response.data);
            this.data.set(response.data);

            // 3. DELEGACIÓN: El servicio calcula y devuelve las opciones de ECharts
            const options = this.apifyChartService.buildChartOptions(network, response.data);
            this.chartOptions.set(options);
          }
        } else {
          this.error.set('La ejecución finalizó, pero no se recuperaron datos.');
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(err.message);
        this.isLoading.set(false);
      }
    });
  }

  loadSpecificRun(runId: string, actorInternalId: string) {
    this.isLoading.set(true);
    this.error.set(null);
    this.data.set([]);
    this.chartOptions.set(null);
    this.runsList.set([]);

    const reverseActorMap: Record<string, string> = {
      'KoJrdxJCTtpon81KY': 'apify/facebook-posts-scraper',
      'shu8hvrXbJbY3Eb9W': 'apify/instagram-scraper',
      'GdWCkxBtKWOsKjdch': 'clockworks/tiktok-scraper',
      'h7sDV53CddomktSi5': 'streamers/youtube-scraper',
      'nFJndFXA5zjCTuudP': 'apify/google-search-scraper'
    };

    const targetActorId = reverseActorMap[actorInternalId] || actorInternalId;
    const network = Object.keys(this.ACTORS_MAP).find(key => this.ACTORS_MAP[key] === targetActorId) || 'instagram';

    this.selectedNetwork.set(network);

    const payload: ApifyPayload = {
      action: 'get-run-data',
      actorId: targetActorId,
      runId: runId
    };

    this.apifyService.executeScraper(payload).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          console.log('[Debug Apify] Datos del Run Específico Seleccionado:', response.data);
          this.data.set(response.data);

          // 4. DELEGACIÓN: Reutilizamos el servicio para los historiales específicos
          const options = this.apifyChartService.buildChartOptions(network, response.data);
          this.chartOptions.set(options);
        } else {
          this.error.set('No se pudo recuperar el dataset de este historial.');
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set(err.message);
        this.isLoading.set(false);
      }
    });
  }

  private buildInputPayload(network: string, urls: string[]) {
    const limit = this.resultsLimit();
    switch (network) {
      case 'youtube': return { startUrls: urls.map(url => ({ url })), maxResults: limit, maxShorts: 0, maxStreams: 0 };
      case 'tiktok':
        const hashtags = urls.filter(u => u.includes('/tag/') || u.startsWith('#')).map(u => u.replace('#', ''));
        const profiles = urls.filter(u => !u.includes('/tag/') && !u.startsWith('#'));
        return { ...(hashtags.length > 0 && { hashtags }), ...(profiles.length > 0 && { profiles }), resultsPerPage: limit };
      case 'instagram': return { directUrls: urls, resultsType: this.scrapeType(), resultsLimit: limit };
      case 'facebook': return { startUrls: urls.map(url => ({ url })), resultsLimit: limit };
      default: return { startUrls: urls.map(url => ({ url })) };
    }
  }
}
