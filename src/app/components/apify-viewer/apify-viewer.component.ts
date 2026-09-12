// src/app/components/apify-viewer/apify-viewer.component.ts
import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';
import { ApifyService, ApifyPayload, ApifyAction, ApifyRunRecord } from '../../services/apify.service';
import { ApifyChartService, ChartMetric } from '../../services/apify-chart.service';

import { ApifyDataGridComponent } from '../apify-data-grid/apify-data-grid.component';
import { ApifyRunsTableComponent } from '../apify-runs-table/apify-runs-table.component';

@Component({
  selector: 'app-apify-viewer',
  standalone: true,
  imports: [
    CommonModule,
    TitleCasePipe,
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
  private apifyChartService = inject(ApifyChartService);

  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  data = signal<any[]>([]);
  runsList = signal<ApifyRunRecord[]>([]);

  loadedNetwork = signal<string>('');

  chartOptions = signal<EChartsOption | null>(null);
  marketShareChartOptions = signal<EChartsOption | null>(null);
  performanceChartOptions = signal<EChartsOption | null>(null);

  // NUEVO: Estado Reactivo para el Ecosistema Omnicanal
  masterChartOptions = signal<EChartsOption | null>(null);

  selectedMetric = signal<ChartMetric>('total');

  dynamicDateRange = computed(() => {
    const currentData = this.data();
    if (!currentData || currentData.length === 0) return null;

    const timestamps = currentData.map(item => {
      const rawDate = item.timestamp || item.time || item.date || item.createTimeISO || item.createdAt;
      if (item.createTime && typeof item.createTime === 'number') return item.createTime * 1000;
      if (typeof rawDate === 'number' && rawDate < 10000000000) return rawDate * 1000;
      return rawDate ? new Date(rawDate).getTime() : null;
    }).filter(t => t !== null && !isNaN(t)) as number[];

    if (timestamps.length === 0) return null;

    const minDate = new Date(Math.min(...timestamps));
    const maxDate = new Date(Math.max(...timestamps));

    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
    return `${minDate.toLocaleDateString('es-ES', opts)} - ${maxDate.toLocaleDateString('es-ES', opts)}`;
  });

  competitorsKpi = computed(() => {
    const currentData = this.data();
    if (!currentData || currentData.length === 0) return [];

    const compMap = new Map<string, any>();

    currentData.forEach(item => {
      const name = item.ownerFullName || item.channelName || item.pageName || item.authorMeta?.name || item.ownerUsername || item.user?.name || 'Competidor';

      let avatar = item.channelAvatarUrl || item.authorMeta?.avatar || item.ownerProfilePicUrl || item.user?.profile_pic_url || item.author?.profilePicture || null;
      let followers = item.numberOfSubscribers || item.authorMeta?.fans || item.ownerFollowers || item.user?.follower_count || item.pageLikes || item.author?.followers || 0;

      if (!compMap.has(name)) {
        compMap.set(name, { name, avatar, followers });
      } else {
        const existing = compMap.get(name);
        if (followers > existing.followers) existing.followers = followers;
        if (avatar && !existing.avatar) existing.avatar = avatar;
      }
    });

    return Array.from(compMap.values()).sort((a, b) => b.followers - a.followers);
  });

  selectedNetwork = signal<string>('youtube');
  actionType = signal<ApifyAction>('get-latest');
  targetUrlsInput = signal<string>('');
  resultsLimit = signal<number>(30);
  scrapeType = signal<string>('posts');
  startDate = signal<string>('');
  endDate = signal<string>('');

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
    this.marketShareChartOptions.set(null);
    this.performanceChartOptions.set(null);
    this.masterChartOptions.set(null);
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
            this.runsList.set(response.data as ApifyRunRecord[]);
          } else {
            this.data.set(response.data);
            this.loadedNetwork.set(network);
            this.selectedMetric.set('total');

            this.chartOptions.set(this.apifyChartService.buildChartOptions(network, response.data, 'total'));
            this.marketShareChartOptions.set(this.apifyChartService.buildMarketShareChart(network, response.data, 'total'));
            this.performanceChartOptions.set(this.apifyChartService.buildPerformanceScatterChart(network, response.data));
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
    this.marketShareChartOptions.set(null);
    this.performanceChartOptions.set(null);
    this.masterChartOptions.set(null);
    this.runsList.set([]);
    this.startDate.set('');
    this.endDate.set('');

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
          this.data.set(response.data);
          this.loadedNetwork.set(network);
          this.selectedMetric.set('total');

          this.chartOptions.set(this.apifyChartService.buildChartOptions(network, response.data, 'total'));
          this.marketShareChartOptions.set(this.apifyChartService.buildMarketShareChart(network, response.data, 'total'));
          this.performanceChartOptions.set(this.apifyChartService.buildPerformanceScatterChart(network, response.data));
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

  // ==========================================
  // NUEVO: EJECUCIÓN MULTIHILO (OMNICANAL)
  // ==========================================
  fetchOmnichannelData() {
    this.isLoading.set(true);
    this.error.set(null);
    this.data.set([]);
    this.chartOptions.set(null);
    this.marketShareChartOptions.set(null);
    this.performanceChartOptions.set(null);
    this.masterChartOptions.set(null);
    this.runsList.set([]);
    this.startDate.set('');
    this.endDate.set('');

    this.apifyService.getOmnichannelLatestData().subscribe({
      next: (consolidatedData) => {
        if (consolidatedData && consolidatedData.length > 0) {
          this.data.set(consolidatedData);
          this.loadedNetwork.set('omnicanal'); // Creamos una red virtual para la vista
          this.selectedMetric.set('total');

          // Solo pintamos el Master Graph y el Market Share general
          this.masterChartOptions.set(this.apifyChartService.buildMasterOmnichannelChart(consolidatedData, 'total'));
          this.marketShareChartOptions.set(this.apifyChartService.buildMarketShareChart('omnicanal', consolidatedData, 'total'));

        } else {
          this.error.set('No se pudieron recuperar datos de ninguna plataforma.');
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        this.error.set('Error crítico cargando ecosistema: ' + err.message);
        this.isLoading.set(false);
      }
    });
  }

  applyFilter(metric: ChartMetric) {
    this.selectedMetric.set(metric);
    const currentData = this.data();
    const currentLoadedNetwork = this.loadedNetwork();

    if (currentData.length > 0 && currentLoadedNetwork) {
      // FIX: El filtro ahora sabe si repintar una red individual o el Master Graph
      if (currentLoadedNetwork === 'omnicanal') {
        this.masterChartOptions.set(this.apifyChartService.buildMasterOmnichannelChart(currentData, metric));
        this.marketShareChartOptions.set(this.apifyChartService.buildMarketShareChart('omnicanal', currentData, metric));
      } else {
        this.chartOptions.set(this.apifyChartService.buildChartOptions(currentLoadedNetwork, currentData, metric));
        this.marketShareChartOptions.set(this.apifyChartService.buildMarketShareChart(currentLoadedNetwork, currentData, metric));
      }
    }
  }

  private buildInputPayload(network: string, urls: string[]) {
    const limit = this.resultsLimit();
    const start = this.startDate();
    const end = this.endDate();
    const basePayload: any = {};

    if (start) {
      basePayload.since = start;
      basePayload.oldestPostDate = start;
    }
    if (end) {
      basePayload.until = end;
    }

    switch (network) {
      case 'youtube': return { ...basePayload, startUrls: urls.map(url => ({ url })), maxResults: limit, maxShorts: 0, maxStreams: 0 };
      case 'tiktok':
        const hashtags = urls.filter(u => u.includes('/tag/') || u.startsWith('#')).map(u => u.replace('#', ''));
        const profiles = urls.filter(u => !u.includes('/tag/') && !u.startsWith('#'));
        return { ...basePayload, ...(hashtags.length > 0 && { hashtags }), ...(profiles.length > 0 && { profiles }), resultsPerPage: limit };
      case 'instagram': return { ...basePayload, directUrls: urls, resultsType: this.scrapeType(), resultsLimit: limit };
      case 'facebook': return { ...basePayload, startUrls: urls.map(url => ({ url })), resultsLimit: limit };
      default: return { ...basePayload, startUrls: urls.map(url => ({ url })) };
    }
  }
}
