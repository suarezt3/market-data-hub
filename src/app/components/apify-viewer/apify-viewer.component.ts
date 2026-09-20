// src/app/components/apify-viewer/apify-viewer.component.ts
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { ApifyService, ApifyRunRecord, ApifyResponse, MarketCountry } from '../../services/apify.service';
import { ApifyChartService, ChartMetric } from '../../services/apify-chart.service';

import { ApifyDataGridComponent } from '../apify-data-grid/apify-data-grid.component';
import { ApifyRunsTableComponent } from '../apify-runs-table/apify-runs-table.component';

export type KpiSortOption = 'followers' | 'views' | 'likes' | 'posts';

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
export class ApifyViewerComponent implements OnInit {
  private apifyService = inject(ApifyService);
  public apifyChartService = inject(ApifyChartService);

  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);

  data = signal<any[]>([]);
  runsList = signal<ApifyRunRecord[]>([]);

  loadedNetwork = signal<string>('');
  loadedCountry = signal<string>('');

  selectedMetric = signal<ChartMetric>('total');
  kpiSortMetric = signal<KpiSortOption>('followers');

  selectedCountry = signal<MarketCountry>('Colombia');

  filterStartDate = signal<string>('');
  filterEndDate = signal<string>('');

  gridBrandFilter = signal<string>('ALL');
  gridNetworkFilter = signal<string>('ALL');
  gridContentTypeFilter = signal<string>('ALL');
  gridSortMetric = signal<string>('date_desc');

  ngOnInit() {
    this.loadHistory();
  }

  // ==========================================
  // LÓGICA DE VALIDACIÓN Y UX CONDICIONAL
  // ==========================================

  onStartDateChange(newDate: string) {
    this.filterStartDate.set(newDate);
    const end = this.filterEndDate();
    if (newDate && end && new Date(newDate) > new Date(end)) {
      this.filterEndDate.set(newDate);
    }
  }

  onEndDateChange(newDate: string) {
    this.filterEndDate.set(newDate);
    const start = this.filterStartDate();
    if (newDate && start && new Date(newDate) < new Date(start)) {
      this.filterStartDate.set(newDate);
    }
  }

  showContentTypeFilter = computed(() => {
    const mainNet = this.loadedNetwork();
    const gridNet = this.gridNetworkFilter();

    if (mainNet === 'youtube') return false;
    if (mainNet === 'omnicanal' && gridNet === 'youtube') return false;

    return true;
  });

  // ==========================================
  // MOTOR REACTIVO PRINCIPAL
  // ==========================================

  filteredData = computed(() => {
    const currentData = this.data();
    const startStr = this.filterStartDate();
    const endStr = this.filterEndDate();

    if (!startStr && !endStr) return currentData;

    const startMs = startStr ? new Date(startStr + 'T00:00:00').getTime() : 0;
    const endMs = endStr ? new Date(endStr + 'T23:59:59').getTime() : Infinity;

    return currentData.filter(item => {
      const rawDate = item.time || item.timestamp || item.date || item.createTimeISO || item.createdAt || item.videoMeta?.createTime || item.createTime;
      let itemMs = 0;

      if (typeof rawDate === 'number') {
        itemMs = rawDate < 10000000000 ? rawDate * 1000 : rawDate;
      } else if (item.createTime && typeof item.createTime === 'number') {
        itemMs = item.createTime < 10000000000 ? item.createTime * 1000 : item.createTime;
      } else {
        itemMs = rawDate ? new Date(rawDate).getTime() : 0;
      }

      if (!itemMs || isNaN(itemMs)) return true;

      return itemMs >= startMs && itemMs <= endMs;
    });
  });

  // ==========================================
  // MOTOR REACTIVO ESPECÍFICO PARA EL GRID
  // ==========================================

  availableBrands = computed(() => {
    const data = this.filteredData();
    const brands = new Set<string>();

    data.forEach(item => {
      const brand = this.apifyChartService.getNormalizedBrandName(item);
      if (brand && brand !== 'Embajadores / Creadores' && brand !== 'Medios y Eventos B2B') {
        brands.add(brand);
      }
    });

    return Array.from(brands).sort();
  });

  gridDisplayData = computed(() => {
    let data = [...this.filteredData()];
    const brandFilter = this.gridBrandFilter();
    const networkFilter = this.gridNetworkFilter();
    const contentTypeFilter = this.gridContentTypeFilter();
    const sortOption = this.gridSortMetric();

    if (networkFilter !== 'ALL') {
      data = data.filter(item => item.__network === networkFilter);
    }

    if (brandFilter !== 'ALL') {
      data = data.filter(item => this.apifyChartService.getNormalizedBrandName(item) === brandFilter);
    }

    if (this.showContentTypeFilter() && contentTypeFilter !== 'ALL') {
      data = data.filter(item => item._contentType === contentTypeFilter);
    }

    data.sort((a, b) => {
      const kpiA = a._kpi || {};
      const kpiB = b._kpi || {};

      switch (sortOption) {
        case 'views_desc':
          return (kpiB.postViews || 0) - (kpiA.postViews || 0);
        case 'likes_desc':
          return (kpiB.postLikes || 0) - (kpiA.postLikes || 0);
        case 'comments_desc':
          return (b.commentsCount || b.commentCount || 0) - (a.commentsCount || a.commentCount || 0);
        case 'date_desc':
        default:
          const getMs = (item: any) => {
            const d = item.time || item.timestamp || item.date || item.createTimeISO || item.createdAt;
            if (typeof d === 'number') return d < 10000000000 ? d * 1000 : d;
            return d ? new Date(d).getTime() : 0;
          };
          return getMs(b) - getMs(a);
      }
    });

    return data;
  });

  // ==========================================
  // GRÁFICAS Y KPIs COMPUTADOS
  // ==========================================

  chartOptions = computed(() => {
    const data = this.filteredData();
    const net = this.loadedNetwork();
    if (!data.length || !net || net === 'omnicanal') return null;
    return this.apifyChartService.buildChartOptions(net, data, this.selectedMetric());
  });

  marketShareChartOptions = computed(() => {
    const data = this.filteredData();
    const net = this.loadedNetwork();
    if (!data.length || !net) return null;
    return this.apifyChartService.buildMarketShareChart(net, data, this.selectedMetric());
  });

  performanceChartOptions = computed(() => {
    const data = this.filteredData();
    const net = this.loadedNetwork();
    if (!data.length || !net || net === 'omnicanal') return null;
    return this.apifyChartService.buildPerformanceScatterChart(net, data);
  });

  masterChartOptions = computed(() => {
    const data = this.filteredData();
    const net = this.loadedNetwork();
    if (!data.length || net !== 'omnicanal') return null;
    return this.apifyChartService.buildMasterOmnichannelChart(data, this.selectedMetric());
  });

  dynamicDateRange = computed(() => {
    const currentData = this.filteredData();
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
    const currentData = this.filteredData();
    if (!currentData || currentData.length === 0) return [];

    const brandNetworkStats = new Map<string, Record<string, {
      followers: number, profileLikes: number, postLikesSum: number,
      profileViews: number, postViewsSum: number,
      profilePosts: number, postCountSum: number, avatar: string | null
    }>>();

    currentData.forEach(item => {
      const brand = this.apifyChartService.getNormalizedBrandName(item);
      if (brand === 'Embajadores / Creadores' || brand === 'Medios y Eventos B2B') return;

      const net = item.__network || 'unknown';
      let avatar = item.ownerProfilePicUrl || item.channelAvatarUrl || item.authorMeta?.avatar || item.user?.profilePic || item.user?.profile_pic_url || item.author?.profilePicture || item.profilePicUrl || item.pageProfilePic || item.avatarUrl || null;

      const kpi = item._kpi || { followers: 0, profileLikes: 0, postLikes: 0, profileViews: 0, postViews: 0, profilePosts: 0, postCount: 0 };

      if (!brandNetworkStats.has(brand)) brandNetworkStats.set(brand, {});
      const networkMap = brandNetworkStats.get(brand)!;

      if (!networkMap[net]) {
        networkMap[net] = {
          followers: kpi.followers, profileLikes: kpi.profileLikes, postLikesSum: kpi.postLikes,
          profileViews: kpi.profileViews, postViewsSum: kpi.postViews,
          profilePosts: kpi.profilePosts, postCountSum: kpi.postCount, avatar
        };
      } else {
        const ex = networkMap[net];
        ex.followers = Math.max(ex.followers, kpi.followers);
        ex.profileLikes = Math.max(ex.profileLikes, kpi.profileLikes);
        ex.profileViews = Math.max(ex.profileViews, kpi.profileViews);
        ex.profilePosts = Math.max(ex.profilePosts, kpi.profilePosts);
        ex.postLikesSum += kpi.postLikes;
        ex.postViewsSum += kpi.postViews;
        ex.postCountSum += kpi.postCount;

        if (avatar && !ex.avatar) ex.avatar = avatar;
      }
    });

    const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
    const sortMetric = this.kpiSortMetric();

    return Array.from(brandNetworkStats.entries())
      .map(([brandName, networkMap]) => {
        let totalFollowers = 0, totalLikes = 0, totalViews = 0, totalPosts = 0;
        let finalAvatar: string | null = null;

        Object.values(networkMap).forEach(stats => {
          totalFollowers += stats.followers;
          totalLikes += (stats.profileLikes > 0 ? stats.profileLikes : stats.postLikesSum);
          totalViews += (stats.profileViews > 0 ? stats.profileViews : stats.postViewsSum);
          totalPosts += (stats.profilePosts > 0 ? stats.profilePosts : stats.postCountSum);
          if (stats.avatar && !finalAvatar) finalAvatar = stats.avatar;
        });

        return {
          name: brandName, avatar: finalAvatar, followers: totalFollowers, accountLikes: totalLikes,
          accountViews: totalViews, accountPosts: totalPosts,
          followersStr: compactFormatter.format(totalFollowers), likesStr: compactFormatter.format(totalLikes),
          viewsStr: compactFormatter.format(totalViews), postsStr: compactFormatter.format(totalPosts)
        };
      })
      .sort((a, b) => {
        if (sortMetric === 'views') return b.accountViews - a.accountViews;
        if (sortMetric === 'likes') return b.accountLikes - a.accountLikes;
        if (sortMetric === 'posts') return b.accountPosts - a.accountPosts;
        return b.followers - a.followers;
      });
  });

  private formatDuration(val: any): string | null {
    if (!val) return null;

    if (typeof val === 'string' && val.includes(':')) {
      const parts = val.split(':');
      if (parts.length === 3 && parts[0] === '00') {
         return `${parseInt(parts[1], 10)}:${parts[2]}`;
      }
      return val;
    }

    const secs = Number(val);
    if (!isNaN(secs) && secs > 0) {
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = Math.floor(secs % 60);

      const sStr = s < 10 ? `0${s}` : `${s}`;
      if (h > 0) {
        const mStr = m < 10 ? `0${m}` : `${m}`;
        return `${h}:${mStr}:${sStr}`;
      }
      return `${m}:${sStr}`;
    }

    return null;
  }

  private getUnifiedContentType(net: string, item: any): string {
    if (net === 'youtube') return 'video';

    if (net === 'tiktok') {
      if (item.isSlideshow || (item.mediaUrls && item.mediaUrls.length > 0)) return 'carousel';
      return 'video';
    }

    if (net === 'instagram') {
      const typeStr = (item.type || item.productType || '').toLowerCase();
      if (typeStr.includes('video') || item.videoUrl) return 'video';
      if (typeStr === 'sidecar' || typeStr === 'carousel_container' || item.carouselMedia) return 'carousel';
      if (typeStr === 'image' || item.displayUrl) return 'image';
      return 'unknown';
    }

    if (net === 'facebook') {
      if (item.videoUrl || item.webVideoUrl || item.video) return 'video';
      if (item.imageUrl || (item.images && item.images.length > 0) || (item.photos && item.photos.length > 0)) return 'image';
      return 'text';
    }

    return 'unknown';
  }

  private standardizeData(rawData: any[], fallbackNetwork: string): any[] {
    let processed: any[] = [];

    rawData.forEach(item => {
      let net = item.__network;

      if (!net || net === 'omnicanal' || net === 'unknown') {
        const urlStr = String(item.url || item.facebookUrl || item.pageUrl || item.webVideoUrl || item.channelUrl || '').toLowerCase();

        if (item.authorMeta || item.authorStats || urlStr.includes('tiktok.com')) net = 'tiktok';
        else if (item.facebookUrl || item.pageName || urlStr.includes('facebook.com')) net = 'facebook';
        else if (item.channelName || item.channelTotalVideos || urlStr.includes('youtube.com')) net = 'youtube';
        else if (item.latestPosts || item.latestIgtvVideos || item.shortCode || item.type === 'Sidecar' || item.type === 'Image' || item.type === 'Video' || urlStr.includes('instagram.com')) net = 'instagram';
        else net = fallbackNetwork !== 'omnicanal' ? fallbackNetwork : 'unknown';
      }

      const uType = this.getUnifiedContentType(net, item);

      if (net === 'instagram') {
        if (item.latestPosts || item.latestIgtvVideos) {
          const allPosts = [...(item.latestPosts || []), ...(item.latestIgtvVideos || [])];
          allPosts.forEach((post: any) => {
            processed.push({
              ...post,
              ownerFullName: item.fullName || item.username,
              ownerUsername: item.username,
              ownerProfilePicUrl: item.profilePicUrlHD || item.profilePicUrl,
              __network: 'instagram',
              _contentType: this.getUnifiedContentType('instagram', post),
              _duration: this.formatDuration(post.videoDuration || post.duration),
              _kpi: {
                followers: item.followersCount || item.followsCount || 0,
                profileLikes: 0,
                postLikes: post.likesCount || post.likes || 0,
                profileViews: 0,
                postViews: post.videoViewCount || post.videoPlayCount || post.playCount || post.viewsCount || 0,
                profilePosts: item.postsCount || 0,
                postCount: 1
              }
            });
          });
        }
        else {
          processed.push({
            ...item,
            ownerFullName: item.ownerFullName || item.ownerUsername || item.owner?.username || 'Desconocido',
            ownerUsername: item.ownerUsername || item.owner?.username || 'Desconocido',
            ownerProfilePicUrl: item.ownerProfilePicUrl || item.owner?.profile_pic_url,
            __network: 'instagram',
            _contentType: uType,
            _duration: this.formatDuration(item.videoDuration || item.duration),
            _kpi: {
              followers: item.followersCount || item.owner?.followersCount || 0,
              profileLikes: 0,
              postLikes: item.likesCount || 0,
              profileViews: 0,
              postViews: item.videoViewCount || item.viewCount || item.playCount || 0,
              profilePosts: 0,
              postCount: 1
            }
          });
        }
      }
      else if (net === 'tiktok') {
        processed.push({
          ...item,
          ownerFullName: item.authorMeta?.nickName || item.authorMeta?.name || item.author?.nickname,
          ownerUsername: item.authorMeta?.name || item.author?.uniqueId,
          ownerProfilePicUrl: item.authorMeta?.avatar || item.author?.avatarLarger,
          url: item.webVideoUrl || item.videoUrl || item.shareUrl,
          __network: 'tiktok',
          _contentType: uType,
          _duration: this.formatDuration(item.videoMeta?.duration || item.duration),
          _kpi: {
             followers: item.authorMeta?.fans || item.authorStats?.followerCount || 0,
             profileLikes: item.authorMeta?.heart || item.authorStats?.heartCount || 0,
             postLikes: item.diggCount || item.stats?.diggCount || item.videoMeta?.diggCount || 0,
             profileViews: 0,
             postViews: item.playCount || item.stats?.playCount || item.videoMeta?.playCount || 0,
             profilePosts: item.authorMeta?.video || item.authorStats?.videoCount || 0, postCount: 1
          }
        });
      }
      else if (net === 'facebook') {
        const isPost = !!item.postId || item.text !== undefined;
        processed.push({
          ...item,
          ownerFullName: isPost ? (item.user?.name || item.pageName) : (item.title || item.pageName),
          ownerUsername: item.pageName,
          ownerProfilePicUrl: isPost ? item.user?.profilePic : item.profilePictureUrl,
          url: isPost ? (item.url || item.topLevelUrl) : (item.pageUrl || item.facebookUrl),
          __network: 'facebook',
          _contentType: uType,
          _duration: this.formatDuration(item.duration || item.video_duration),
          _kpi: {
             followers: isPost ? 0 : (item.followers || item.likes || 0),
             profileLikes: 0, postLikes: isPost ? (item.likes || item.reactionLikeCount || 0) : 0,
             profileViews: 0, postViews: isPost ? (item.viewsCount || item.videoPostViewCount || 0) : 0,
             profilePosts: 0, postCount: isPost ? 1 : 0
          }
        });
      }
      else if (net === 'youtube') {
        const isVideo = item.type === 'video' || item.videoId || item.url?.includes('watch');
        processed.push({
          ...item,
          ownerFullName: item.channelName || item.aboutChannelInfo?.channelName,
          ownerUsername: item.channelUsername || item.aboutChannelInfo?.channelUsername,
          ownerProfilePicUrl: item.channelAvatarUrl || item.aboutChannelInfo?.channelAvatarUrl,
          __network: 'youtube',
          _contentType: uType,
          _duration: this.formatDuration(item.duration),
          _kpi: {
             followers: item.numberOfSubscribers || item.aboutChannelInfo?.numberOfSubscribers || 0,
             profileLikes: 0,
             postLikes: item.likes || 0,
             profileViews: item.channelTotalViews || item.aboutChannelInfo?.channelTotalViews || 0,
             postViews: item.viewCount || 0,
             profilePosts: item.channelTotalVideos || item.aboutChannelInfo?.channelTotalVideos || 0,
             postCount: isVideo ? 1 : 0
          }
        });
      }
      else {
        processed.push({
          ...item, __network: net, _contentType: 'unknown',
          _kpi: { followers: item.followersCount || 0, profileLikes: 0, postLikes: 0, profileViews: 0, postViews: 0, profilePosts: item.postsCount || 0, postCount: 1 }
        });
      }
    });

    return processed;
  }

  // ==========================================
  // CARGA DE DATOS Y EVENTOS
  // ==========================================

  loadHistory() {
    this.resetState();
    this.isLoading.set(true);

    this.apifyService.executeScraper({ action: 'list-runs' }).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          const allRuns = response.data as ApifyRunRecord[];

          const fbPosts = allRuns.filter(r => r.actorId === 'KoJrdxJCTtpon81KY' || r.actorId === 'apify/facebook-posts-scraper');
          const fbPages = allRuns.filter(r => r.actorId === '4Hv5RhChiaDk6iwad' || r.actorId === 'apify/facebook-pages-scraper');

          const otherRuns = allRuns.filter(r =>
            r.actorId !== 'KoJrdxJCTtpon81KY' && r.actorId !== 'apify/facebook-posts-scraper' &&
            r.actorId !== '4Hv5RhChiaDk6iwad' && r.actorId !== 'apify/facebook-pages-scraper'
          );

          const finalRuns = [...otherRuns];

          if (fbPosts.length > 0 || fbPages.length > 0) {
            const latestPost = fbPosts[0] || null;
            const latestPage = fbPages[0] || null;

            finalRuns.push({
              id: `HYBRID|${latestPost?.id || 'none'}|${latestPage?.id || 'none'}`,
              actorId: 'Facebook (Consolidado)',
              status: (latestPost?.status === 'SUCCEEDED' || latestPage?.status === 'SUCCEEDED') ? 'SUCCEEDED' : 'FAILED',
              startedAt: latestPost?.startedAt || latestPage?.startedAt || new Date().toISOString(),
              finishedAt: latestPost?.finishedAt || latestPage?.finishedAt || new Date().toISOString(),
              usageTotalUsd: (latestPost?.usageTotalUsd || 0) + (latestPage?.usageTotalUsd || 0),
              country: latestPost?.country || latestPage?.country || 'Colombia',
              inputStartDate: latestPost?.inputStartDate,
              inputEndDate: latestPost?.inputEndDate
            });
          }

          finalRuns.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
          this.runsList.set(finalRuns);
        } else {
          this.error.set('No se pudo recuperar el historial de ejecuciones.');
        }
        this.isLoading.set(false);
      },
      error: (err) => { this.error.set(err.message); this.isLoading.set(false); }
    });
  }

  loadSpecificRun(runId: string, actorInternalId: string) {
    this.resetState();
    this.isLoading.set(true);

    const historyRun = this.runsList().find(r => r.id === runId);
    const runCountry = historyRun?.country || 'Colombia';
    this.selectedCountry.set(runCountry as MarketCountry);

    if (runId.startsWith('HYBRID|')) {
      const parts = runId.split('|');
      const postsRunId = parts[1];
      const pagesRunId = parts[2];
      const reqs = [];

      if (postsRunId && postsRunId !== 'none') {
        reqs.push(this.apifyService.executeScraper({ action: 'get-run-data', actorId: 'KoJrdxJCTtpon81KY', runId: postsRunId })
          .pipe(catchError(() => of({ success: true, data: [] } as ApifyResponse))));
      }
      if (pagesRunId && pagesRunId !== 'none') {
        reqs.push(this.apifyService.executeScraper({ action: 'get-run-data', actorId: '4Hv5RhChiaDk6iwad', runId: pagesRunId })
          .pipe(catchError(() => of({ success: true, data: [] } as ApifyResponse))));
      }

      if (reqs.length === 0) {
        this.error.set('No hay IDs de ejecución válidos para Facebook.');
        this.isLoading.set(false);
        return;
      }

      forkJoin(reqs).subscribe(results => {
        const combined = results.map(r => r.data || []).flat();
        if (combined.length > 0) {
          this.processDataset(combined, 'facebook', runCountry);
        } else {
          this.error.set('No se pudo recuperar el dataset híbrido.');
        }
        this.isLoading.set(false);
      });
      return;
    }

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

    if (reverseActorMap[actorInternalId]) targetActorId = reverseActorMap[actorInternalId];
    if (targetActorId.includes('facebook')) network = 'facebook';
    if (targetActorId.includes('tiktok')) network = 'tiktok';
    if (targetActorId.includes('youtube')) network = 'youtube';

    this.apifyService.executeScraper({ action: 'get-run-data', actorId: targetActorId, runId }).subscribe({
      next: (response) => {
        if (response.success && response.data && response.data.length > 0) {
          const sample = response.data[0];
          if (sample.facebookUrl || sample.pageUrl) network = 'facebook';
          if (sample.channelName && sample.channelTotalVideos) network = 'youtube';

          this.processDataset(response.data, network, runCountry);
        } else {
          this.error.set('No se pudo recuperar el dataset.');
        }
        this.isLoading.set(false);
      },
      error: (err) => { this.error.set(err.message); this.isLoading.set(false); }
    });
  }

  // FIX: Type Assertion aplicado para evitar errores de tipado estricto
  onRunCountryChanged(event: {runId: string, newCountry: string}) {
    // 1. Optimistic UI Update: Actualizamos la tabla visualmente al instante
    this.runsList.update(runs => runs.map(r =>
      r.id === event.runId ? ({ ...r, country: event.newCountry as MarketCountry } as ApifyRunRecord) : r
    ));

    // 2. Persistencia en Supabase
    if ((this.apifyService as any).updateRunCountry) {
      (this.apifyService as any).updateRunCountry(event.runId, event.newCountry).subscribe({
        error: () => {
          this.error.set('No se pudo guardar el mercado en Supabase. Se revertirá al recargar.');
        }
      });
    } else {
      console.warn('Backend Reminder: Falta implementar el método updateRunCountry en apify.service.ts para guardar en Supabase.');
    }
  }

  fetchOmnichannelData() {
    this.resetState();
    this.isLoading.set(true);
    const currentCountry = this.selectedCountry();

    this.apifyService.getOmnichannelLatestData(currentCountry).subscribe({
      next: (consolidatedData) => {
        if (consolidatedData && consolidatedData.length > 0) {
          this.processDataset(consolidatedData, 'omnicanal', currentCountry);
        } else {
          this.error.set('No se pudieron recuperar datos.');
        }
        this.isLoading.set(false);
      },
      error: (err) => { this.error.set(err.message); this.isLoading.set(false); }
    });
  }

  private processDataset(rawData: any[], network: string, country: string) {
    const cleanData = this.standardizeData(rawData, network);
    this.data.set(cleanData);
    this.loadedNetwork.set(network);
    this.loadedCountry.set(country);

    const hasEngagement = cleanData.some(item =>
      item._kpi.postLikes > 0 || item._kpi.profileLikes > 0 ||
      (item.commentsCount && item.commentsCount > 0)
    );
    this.selectedMetric.set(hasEngagement ? 'total' : 'views');
  }

  applyFilter(metric: ChartMetric) {
    this.selectedMetric.set(metric);
  }

  changeKpiSort(metric: KpiSortOption) {
    this.kpiSortMetric.set(metric);
  }

  private resetState() {
    this.error.set(null);
    this.data.set([]);
    this.filterStartDate.set('');
    this.filterEndDate.set('');
    this.gridBrandFilter.set('ALL');
    this.gridNetworkFilter.set('ALL');
    this.gridContentTypeFilter.set('ALL');
    this.gridSortMetric.set('date_desc');
  }
}
