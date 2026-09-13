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
  masterChartOptions = signal<EChartsOption | null>(null);

  selectedMetric = signal<ChartMetric>('total');

  // ==========================================
  // LÓGICA COMPUTADA AVANZADA
  // ==========================================

  dynamicDateRange = computed(() => {
    const currentData = this.data();
    if (!currentData || currentData.length === 0) return null;

    const timestamps = currentData.map(item => {
      const rawDate = item.time || item.timestamp || item.date || item.createTimeISO || item.createdAt || item.videoMeta?.createTime || item.createTime;

      if (typeof rawDate === 'number') {
         return rawDate < 10000000000 ? rawDate * 1000 : rawDate;
      }
      if (item.createTime && typeof item.createTime === 'number') {
         return item.createTime < 10000000000 ? item.createTime * 1000 : item.createTime;
      }
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

    const brandKpiMap = new Map<string, { name: string, avatar: string, followers: number, accountLikes: number, accountPosts: number }>();

    currentData.forEach(item => {
      const brand = this.apifyChartService.getNormalizedBrandName(item);

      if (brand === 'Embajadores / Creadores' || brand === 'Medios y Eventos B2B') return;

      let avatar = item.ownerProfilePicUrl || item.channelAvatarUrl || item.authorMeta?.avatar || item.user?.profilePic || item.user?.profile_pic_url || item.author?.profilePicture || item.profilePicUrl || item.pageProfilePic || item.avatarUrl || null;

      let followers = item.ownerFollowers || item.followersCount || item.numberOfSubscribers || item.authorMeta?.fans || item.author?.fans || item.user?.follower_count || item.pageLikes || item.pageFollowers || item.page?.followers || item.page_info?.followers || item.followers || item.stats?.followerCount || 0;

      let accountLikes = item.ownerAccountLikes || item.authorMeta?.heart || item.author?.heart || item.totalLikes || item.user?.total_favorited || 0;

      // FIX: Asegurar la lectura de ownerPostsCount (que inyectaremos para Youtube y otros)
      let accountPosts = item.ownerPostsCount || item.authorMeta?.video || item.postsCount || item.author?.video || item.user?.aweme_count || 0;

      if (!brandKpiMap.has(brand)) {
        brandKpiMap.set(brand, { name: brand, avatar, followers, accountLikes, accountPosts });
      } else {
        const existing = brandKpiMap.get(brand)!;
        if (followers > existing.followers) existing.followers = followers;
        if (accountLikes > existing.accountLikes) existing.accountLikes = accountLikes;
        if (accountPosts > existing.accountPosts) existing.accountPosts = accountPosts;
        if (avatar && !existing.avatar) existing.avatar = avatar;
      }
    });

    const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

    return Array.from(brandKpiMap.values())
      .sort((a, b) => b.followers - a.followers)
      .map(comp => ({
        ...comp,
        followersStr: compactFormatter.format(comp.followers),
        likesStr: compactFormatter.format(comp.accountLikes),
        postsStr: compactFormatter.format(comp.accountPosts)
      }));
  });

  selectedNetwork = signal<string>('tiktok');
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

  // ==========================================
  // INTERCEPTOR DE DATOS (DATA FLATTENING)
  // ==========================================
  private standardizeData(rawData: any[], fallbackNetwork: string): any[] {
    let processed: any[] = [];

    rawData.forEach(item => {
      const net = item.__network || fallbackNetwork;

      if (net === 'instagram' && (item.latestPosts || item.latestIgtvVideos)) {
        const allPosts = [...(item.latestPosts || []), ...(item.latestIgtvVideos || [])];
        allPosts.forEach((post: any) => {
          processed.push({
            ...post,
            ownerFullName: item.fullName || item.username,
            ownerUsername: item.username,
            ownerProfilePicUrl: item.profilePicUrlHD || item.profilePicUrl,
            ownerFollowers: item.followersCount || item.followsCount || 0,
            ownerPostsCount: item.postsCount || 0,
            __network: 'instagram'
          });
        });
      }
      else if (net === 'tiktok') {
        processed.push({
          ...item,
          ownerFullName: item.authorMeta?.nickName || item.authorMeta?.name || item.author?.nickname,
          ownerUsername: item.authorMeta?.name || item.author?.uniqueId,
          ownerProfilePicUrl: item.authorMeta?.avatar || item.author?.avatarLarger,
          ownerFollowers: item.authorMeta?.fans || item.authorStats?.followerCount || 0,
          url: item.webVideoUrl || item.videoUrl || item.shareUrl,
          __network: 'tiktok'
        });
      }
      else if (net === 'facebook') {
        const isPageScraper = item.followers !== undefined || !!item.profilePictureUrl;

        processed.push({
          ...item,
          ownerFullName: isPageScraper ? (item.title || item.pageName) : (item.user?.name || item.pageName),
          ownerUsername: item.pageName,
          ownerProfilePicUrl: isPageScraper ? item.profilePictureUrl : item.user?.profilePic,
          ownerFollowers: isPageScraper ? (item.followers || 0) : 0,
          ownerAccountLikes: isPageScraper ? (item.likes || 0) : 0,
          url: isPageScraper ? (item.pageUrl || item.facebookUrl) : (item.url || item.facebookUrl),
          __network: 'facebook'
        });
      }
      // FIX: Adaptador para YouTube
      else if (net === 'youtube') {
        processed.push({
          ...item,
          // Extraemos el nombre del canal para que no diga "MARCA"
          ownerFullName: item.channelName,
          ownerUsername: item.channelUsername,
          ownerProfilePicUrl: item.channelAvatarUrl,
          ownerFollowers: item.numberOfSubscribers || 0,
          // Extraemos el total de videos del canal
          ownerPostsCount: item.channelTotalVideos || 0,
          // (Opcional) Podemos inyectar las vistas totales como likes para que no quede en 0
          ownerAccountLikes: item.channelTotalViews || 0,
          __network: 'youtube'
        });
      }
      else {
        processed.push({ ...item, __network: net });
      }
    });

    return processed;
  }

  fetchData() {
    const rawUrls = this.targetUrlsInput().split('\n').map(u => u.trim()).filter(u => u !== '');
    if (rawUrls.length === 0 && this.actionType() === 'run') {
      this.error.set('Por favor, ingresa al menos una URL válida.');
      return;
    }

    this.resetState();
    const network = this.selectedNetwork();

    const payload: ApifyPayload = {
      action: this.actionType(),
      actorId: this.ACTORS_MAP[network],
      ...(this.actionType() === 'run' ? { inputPayload: this.buildInputPayload(network, rawUrls) } : {})
    };

    this.apifyService.executeScraper(payload).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          if (this.actionType() === 'list-runs') {
            this.runsList.set(response.data as ApifyRunRecord[]);
          } else {
            const cleanData = this.standardizeData(response.data, network);
            this.data.set(cleanData);
            this.loadedNetwork.set(network);
            this.selectedMetric.set('total');

            this.chartOptions.set(this.apifyChartService.buildChartOptions(network, cleanData, 'total'));
            this.marketShareChartOptions.set(this.apifyChartService.buildMarketShareChart(network, cleanData, 'total'));
            this.performanceChartOptions.set(this.apifyChartService.buildPerformanceScatterChart(network, cleanData));
          }
        } else {
          this.error.set('La ejecución finalizó sin datos.');
        }
        this.isLoading.set(false);
      },
      error: (err) => { this.error.set(err.message); this.isLoading.set(false); }
    });
  }

  loadSpecificRun(runId: string, actorInternalId: string) {
    this.resetState();

    let targetActorId = actorInternalId;
    let network = 'instagram';

    const reverseActorMap: Record<string, string> = {
      'KoJrdxJCTtpon81KY': 'apify/facebook-posts-scraper',
      '4Hv5RhChiaDk6iwad': 'apify/facebook-pages-scraper', // Asegurando el ID de FB Pages
      'shu8hvrXbJbY3Eb9W': 'apify/instagram-scraper',
      'GdWCkxBtKWOsKjdch': 'clockworks/tiktok-scraper',
      '0FXVyOXXEmdGcV88a': 'clockworks/tiktok-scraper',
      'h7sDV53CddomktSi5': 'streamers/youtube-scraper',
      'nFJndFXA5zjCTuudP': 'apify/google-search-scraper'
    };

    if (reverseActorMap[actorInternalId]) {
      targetActorId = reverseActorMap[actorInternalId];
    }

    if (targetActorId.includes('facebook')) network = 'facebook';
    if (targetActorId.includes('tiktok')) network = 'tiktok';
    if (targetActorId.includes('youtube')) network = 'youtube';

    this.apifyService.executeScraper({ action: 'get-run-data', actorId: targetActorId, runId }).subscribe({
      next: (response) => {
        if (response.success && response.data && response.data.length > 0) {

          const sample = response.data[0];
          if (sample.facebookUrl || sample.pageUrl) network = 'facebook';
          if (sample.channelName && sample.channelTotalVideos) network = 'youtube'; // Inferencia Segura

          this.selectedNetwork.set(network);

          const cleanData = this.standardizeData(response.data, network);
          this.data.set(cleanData);
          this.loadedNetwork.set(network);
          this.selectedMetric.set('total');

          this.chartOptions.set(this.apifyChartService.buildChartOptions(network, cleanData, 'total'));
          this.marketShareChartOptions.set(this.apifyChartService.buildMarketShareChart(network, cleanData, 'total'));
          this.performanceChartOptions.set(this.apifyChartService.buildPerformanceScatterChart(network, cleanData));
        } else {
          this.error.set('No se pudo recuperar el dataset.');
        }
        this.isLoading.set(false);
      },
      error: (err) => { this.error.set(err.message); this.isLoading.set(false); }
    });
  }

  fetchOmnichannelData() {
    this.resetState();

    this.apifyService.getOmnichannelLatestData().subscribe({
      next: (consolidatedData) => {
        if (consolidatedData && consolidatedData.length > 0) {
          const cleanData = this.standardizeData(consolidatedData, 'omnicanal');

          this.data.set(cleanData);
          this.loadedNetwork.set('omnicanal');
          this.selectedMetric.set('total');

          this.masterChartOptions.set(this.apifyChartService.buildMasterOmnichannelChart(cleanData, 'total'));
          this.marketShareChartOptions.set(this.apifyChartService.buildMarketShareChart('omnicanal', cleanData, 'total'));
        } else {
          this.error.set('No se pudieron recuperar datos.');
        }
        this.isLoading.set(false);
      },
      error: (err) => { this.error.set(err.message); this.isLoading.set(false); }
    });
  }

  applyFilter(metric: ChartMetric) {
    this.selectedMetric.set(metric);
    const currentData = this.data();
    const currentLoadedNetwork = this.loadedNetwork();

    if (currentData.length > 0 && currentLoadedNetwork) {
      if (currentLoadedNetwork === 'omnicanal') {
        this.masterChartOptions.set(this.apifyChartService.buildMasterOmnichannelChart(currentData, metric));
        this.marketShareChartOptions.set(this.apifyChartService.buildMarketShareChart('omnicanal', currentData, metric));
      } else {
        this.chartOptions.set(this.apifyChartService.buildChartOptions(currentLoadedNetwork, currentData, metric));
        this.marketShareChartOptions.set(this.apifyChartService.buildMarketShareChart(currentLoadedNetwork, currentData, metric));
      }
    }
  }

  private resetState() {
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
  }

  private buildInputPayload(network: string, urls: string[]) {
    // ... Código igual para el payload
    return {};
  }
}
