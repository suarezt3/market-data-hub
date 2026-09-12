// src/app/components/apify-viewer/apify-viewer.component.ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JsonPipe, DatePipe, CurrencyPipe } from '@angular/common';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsOption } from 'echarts';
import { ApifyService, ApifyPayload, ApifyAction, ApifyRunRecord } from '../../services/apify.service';

// 1. IMPORTACIÓN ESTRATÉGICA: Traemos nuestro Dumb Component de UI
import { ApifyDataGridComponent } from '../apify-data-grid/apify-data-grid.component';

@Component({
  selector: 'app-apify-viewer',
  standalone: true,
  // 2. REGISTRO: Declaramos el componente para poder usarlo en el HTML padre
  imports: [JsonPipe, FormsModule, NgxEchartsDirective, DatePipe, CurrencyPipe, ApifyDataGridComponent],
  templateUrl: './apify-viewer.component.html',
  styleUrl: './apify-viewer.component.scss'
})
export class ApifyViewerComponent {
  private apifyService = inject(ApifyService);

  // Estados reactivos
  isLoading = signal<boolean>(false);
  error = signal<string | null>(null);
  data = signal<any[]>([]);
  chartOptions = signal<EChartsOption | null>(null);
  runsList = signal<ApifyRunRecord[]>([]);

  // Formulario
  selectedNetwork = signal<string>('youtube'); // Por defecto a youtube por ahora
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
            this.generateChartOptions(network, response.data);
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

    // Actualizamos el select visualmente para que coincida con el Run cargado
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
          this.generateChartOptions(network, response.data);
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

  getActorFriendlyName(actorInternalId: string): string {
    const names: Record<string, string> = {
      'KoJrdxJCTtpon81KY': 'Facebook (Páginas)',
      'shu8hvrXbJbY3Eb9W': 'Instagram (Perfiles)',
      'GdWCkxBtKWOsKjdch': 'TikTok (Perfiles)',
      'h7sDV53CddomktSi5': 'YouTube (Canales)',
      'nFJndFXA5zjCTuudP': 'Búsqueda de Google'
    };
    return names[actorInternalId] || actorInternalId;
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

  private generateChartOptions(network: string, rawData: any[]) {
    const groupedData: Record<string, any[]> = {};
    let metricName = 'Métrica';
    let itemLabel = 'Post';

    if (network === 'youtube' || network === 'tiktok') itemLabel = 'Video';
    else if (network === 'facebook' || network === 'instagram') itemLabel = 'Publicación';

    const sortedData = [...rawData].sort((a, b) => {
      const dateA = new Date(a.date || a.timestamp || a.createdAt || 0).getTime();
      const dateB = new Date(b.date || b.timestamp || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    sortedData.forEach(item => {
      let authorName = 'Desconocido';
      if (network === 'youtube') {
        authorName = item.channelName || 'YouTube Channel';
        metricName = 'Vistas';
      } else if (network === 'tiktok') {
        authorName = item.authorMeta?.name || item.author || 'TikTok Profile';
        metricName = 'Reproducciones';
      } else {
        authorName = item.pageName || item.ownerUsername || item.user?.name || 'Social Profile';
        metricName = 'Interacciones';
      }

      if (!groupedData[authorName]) groupedData[authorName] = [];
      groupedData[authorName].push(item);
    });

    const seriesConfig: any[] = [];
    const legendData: string[] = Object.keys(groupedData);
    let maxItems = 0;
    const colorPalette = ['#3ecf8e', '#6366f1', '#f43f5e', '#f59e0b', '#0ea5e9', '#8b5cf6'];

    Object.entries(groupedData).forEach(([author, items], index) => {
      if (items.length > maxItems) maxItems = items.length;

      const seriesData = items.slice(0, 15).map(i => {
        const val = network === 'youtube' ? (i.viewCount || 0) :
                    network === 'tiktok' ? (i.playCount || 0) :
                    (i.likesCount || i.likes || 0);
        return { value: val, meta: i };
      });

      seriesConfig.push({
        name: author,
        type: 'bar',
        data: seriesData,
        itemStyle: { color: colorPalette[index % colorPalette.length], borderRadius: [4, 4, 0, 0] },
        animationDuration: 1500,
        animationEasing: 'cubicInOut'
      });
    });

    const xAxisLabels = Array.from({ length: Math.min(maxItems, 15) }, (_, i) => `${itemLabel} ${i + 1}`);

    const options: EChartsOption = {
      title: { text: `Comparativa de ${metricName} (Cronológico)`, textStyle: { fontFamily: 'Lato', fontSize: 16, color: '#111827' } },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255, 255, 255, 0.98)',
        borderColor: '#e5e7eb',
        padding: 12,
        textStyle: { color: '#374151', fontFamily: 'Lato' },
        formatter: (params: any) => {
          const meta = params.data.meta;
          if (!meta) return `<b>${params.seriesName}</b><br/>${params.name}: ${params.value.toLocaleString()}`;

          const title = meta.title || meta.text || 'Sin texto/título';
          const shortTitle = title.length > 70 ? title.substring(0, 70) + '...' : title;
          const date = meta.date || meta.timestamp ? new Date(meta.date || meta.timestamp).toLocaleDateString() : 'Fecha desconocida';
          const likes = meta.likes || meta.likesCount || 0;

          return `
            <div style="max-width: 320px; white-space: normal;">
              <strong style="color: ${params.color}; font-size: 14px;">${params.seriesName}</strong>
              <hr style="margin: 8px 0; border: 0; border-top: 1px solid #e5e7eb;" />
              <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">📅 Publicado: ${date}</div>
              <div style="font-weight: 600; font-size: 13px; line-height: 1.4; margin-bottom: 12px;">"${shortTitle}"</div>
              <div style="display: flex; justify-content: space-between; font-size: 13px; background: #f9fafb; padding: 6px; border-radius: 4px;">
                <span>📊 <b>${params.value.toLocaleString()}</b> ${metricName.toLowerCase()}</span>
                <span>❤️ <b>${likes.toLocaleString()}</b> likes</span>
              </div>
            </div>
          `;
        }
      },
      legend: { data: legendData, top: 30, textStyle: { fontFamily: 'Lato' } },
      grid: { left: '3%', right: '4%', bottom: '10%', top: 90, containLabel: true },
      xAxis: { type: 'category', data: xAxisLabels, axisLabel: { fontFamily: 'Lato' } },
      yAxis: { type: 'value', axisLabel: { fontFamily: 'Lato' } },
      series: seriesConfig
    };

    this.chartOptions.set(options);
  }
}
