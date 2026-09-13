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
  // LÓGICA COMPUTADA AVANZADA (MOTOR KPI INTELIGENTE)
  // ==========================================

  dynamicDateRange = computed(() => {
    const currentData = this.data();
    if (!currentData || currentData.length === 0) return null;

    const timestamps = currentData.map(item => {
      const rawDate = item.time || item.timestamp || item.date || item.createTimeISO || item.createdAt || item.videoMeta?.createTime || item.createTime;
      if (typeof rawDate === 'number') return rawDate < 10000000000 ? rawDate * 1000 : rawDate;
      if (item.createTime && typeof item.createTime === 'number') return item.createTime < 10000000000 ? item.createTime * 1000 : item.createTime;
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

    const brandNetworkStats = new Map<string, Record<string, {
      followers: number,
      profileLikes: number, postLikesSum: number,
      profileViews: number, postViewsSum: number,
      posts: number, avatar: string | null
    }>>();

    currentData.forEach(item => {
      const brand = this.apifyChartService.getNormalizedBrandName(item);
      if (brand === 'Embajadores / Creadores' || brand === 'Medios y Eventos B2B') return;

      const net = item.__network || 'unknown';
      let avatar = item.ownerProfilePicUrl || item.channelAvatarUrl || item.authorMeta?.avatar || item.user?.profilePic || item.user?.profile_pic_url || item.author?.profilePicture || item.profilePicUrl || item.pageProfilePic || item.avatarUrl || null;

      // Extraemos la capa _kpi construida en standardizeData
      const kpi = item._kpi || { followers: 0, profileLikes: 0, postLikes: 0, profileViews: 0, postViews: 0, posts: 0 };

      if (!brandNetworkStats.has(brand)) brandNetworkStats.set(brand, {});
      const networkMap = brandNetworkStats.get(brand)!;

      if (!networkMap[net]) {
        networkMap[net] = {
          followers: kpi.followers,
          profileLikes: kpi.profileLikes,
          postLikesSum: kpi.postLikes,
          profileViews: kpi.profileViews,
          postViewsSum: kpi.postViews,
          posts: kpi.posts,
          avatar
        };
      } else {
        const ex = networkMap[net];
        // Métricas de Perfil: Nos quedamos con el valor histórico más alto (MAX)
        ex.followers = Math.max(ex.followers, kpi.followers);
        ex.profileLikes = Math.max(ex.profileLikes, kpi.profileLikes);
        ex.profileViews = Math.max(ex.profileViews, kpi.profileViews);
        ex.posts = Math.max(ex.posts, kpi.posts);

        // Métricas Proxy de Post: Acumulamos iterativamente (SUM)
        ex.postLikesSum += kpi.postLikes;
        ex.postViewsSum += kpi.postViews;

        if (avatar && !ex.avatar) ex.avatar = avatar;
      }
    });

    const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

    return Array.from(brandNetworkStats.entries())
      .map(([brandName, networkMap]) => {
        let totalFollowers = 0;
        let totalLikes = 0;
        let totalViews = 0;
        let totalPosts = 0;
        let finalAvatar: string | null = null;

        Object.values(networkMap).forEach(stats => {
          totalFollowers += stats.followers;
          // Priorizamos las métricas de perfil. Si no existen (ej: IG/TikTok views), usamos la sumatoria proxy
          totalLikes += (stats.profileLikes > 0 ? stats.profileLikes : stats.postLikesSum);
          totalViews += (stats.profileViews > 0 ? stats.profileViews : stats.postViewsSum);
          totalPosts += stats.posts;
          if (stats.avatar && !finalAvatar) finalAvatar = stats.avatar;
        });

        return {
          name: brandName,
          avatar: finalAvatar,
          followers: totalFollowers,
          accountLikes: totalLikes,
          accountViews: totalViews,
          accountPosts: totalPosts,
          followersStr: compactFormatter.format(totalFollowers),
          likesStr: compactFormatter.format(totalLikes),
          viewsStr: compactFormatter.format(totalViews),
          postsStr: compactFormatter.format(totalPosts)
        };
      })
      .sort((a, b) => b.followers - a.followers);
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
  // INFERENCIA FUERTE DE RED Y FLATTENING
  // ==========================================
  private standardizeData(rawData: any[], fallbackNetwork: string): any[] {
    let processed: any[] = [];

    rawData.forEach(item => {
      let net = item.__network;
      if (!net || net === 'omnicanal' || net === 'unknown') {
        const urlStr = String(item.url || item.facebookUrl || item.pageUrl || item.webVideoUrl || item.channelUrl || '').toLowerCase();

        if (item.authorMeta || item.authorStats || urlStr.includes('tiktok.com')) net = 'tiktok';
        else if (item.facebookUrl || item.pageName || urlStr.includes('facebook.com')) net = 'facebook';
        else if (item.channelName || item.channelTotalVideos || urlStr.includes('youtube.com')) net = 'youtube';
        else if (item.latestPosts || item.latestIgtvVideos || item.ownerUsername || urlStr.includes('instagram.com')) net = 'instagram';
        else net = fallbackNetwork !== 'omnicanal' ? fallbackNetwork : 'unknown';
      }

      if (net === 'instagram' && (item.latestPosts || item.latestIgtvVideos)) {
        const allPosts = [...(item.latestPosts || []), ...(item.latestIgtvVideos || [])];
        allPosts.forEach((post: any) => {
          processed.push({
            ...post,
            ownerFullName: item.fullName || item.username,
            ownerUsername: item.username,
            ownerProfilePicUrl: item.profilePicUrlHD || item.profilePicUrl,
            __network: 'instagram',
            // Nueva Capa Estándar de KPIs
            _kpi: {
              followers: item.followersCount || item.followsCount || 0,
              profileLikes: 0,
              postLikes: post.likesCount || post.likes || 0,
              profileViews: 0,
              postViews: post.videoViewCount || post.videoPlayCount || post.playCount || post.viewsCount || 0,
              posts: item.postsCount || 0
            }
          });
        });
      }
      else if (net === 'tiktok') {
        processed.push({
          ...item,
          ownerFullName: item.authorMeta?.nickName || item.authorMeta?.name || item.author?.nickname,
          ownerUsername: item.authorMeta?.name || item.author?.uniqueId,
          ownerProfilePicUrl: item.authorMeta?.avatar || item.author?.avatarLarger,
          url: item.webVideoUrl || item.videoUrl || item.shareUrl,
          __network: 'tiktok',
          _kpi: {
             followers: item.authorMeta?.fans || item.authorStats?.followerCount || 0,
             profileLikes: item.authorMeta?.heart || item.authorStats?.heartCount || 0,
             postLikes: item.diggCount || item.stats?.diggCount || item.videoMeta?.diggCount || 0,
             profileViews: 0,
             postViews: item.playCount || item.stats?.playCount || item.videoMeta?.playCount || 0,
             posts: item.authorMeta?.video || item.authorStats?.videoCount || 0
          }
        });
      }
      else if (net === 'facebook') {
        const isPageScraper = item.followers !== undefined || !!item.profilePictureUrl || !!item.pageName;
        processed.push({
          ...item,
          ownerFullName: isPageScraper ? (item.title || item.pageName) : (item.user?.name || item.pageName),
          ownerUsername: item.pageName,
          ownerProfilePicUrl: isPageScraper ? item.profilePictureUrl : item.user?.profilePic,
          url: isPageScraper ? (item.pageUrl || item.facebookUrl) : (item.url || item.facebookUrl),
          __network: 'facebook',
          _kpi: {
             followers: isPageScraper ? (item.followers || item.likes || 0) : 0,
             profileLikes: 0, postLikes: 0, profileViews: 0, postViews: 0, posts: 0
          }
        });
      }
      else if (net === 'youtube') {
        processed.push({
          ...item,
          ownerFullName: item.channelName,
          ownerUsername: item.channelUsername,
          ownerProfilePicUrl: item.channelAvatarUrl,
          __network: 'youtube',
          _kpi: {
             followers: item.numberOfSubscribers || 0,
             profileLikes: 0, postLikes: 0,
             profileViews: item.channelTotalViews || 0, postViews: 0,
             posts: item.channelTotalVideos || 0
          }
        });
      }
      else {
        processed.push({
          ...item,
          __network: net,
          _kpi: { followers: item.followersCount || 0, profileLikes: 0, postLikes: 0, profileViews: 0, postViews: 0, posts: item.postsCount || 0 }
        });
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
      '4Hv5RhChiaDk6iwad': 'apify/facebook-pages-scraper',
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
          if (sample.channelName && sample.channelTotalVideos) network = 'youtube';

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
    return {};
  }
}
