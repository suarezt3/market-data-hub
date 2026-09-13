// src/app/services/apify-chart.service.ts
import { Injectable } from '@angular/core';
import type { EChartsOption } from 'echarts';

export type ChartMetric = 'total' | 'views' | 'likes' | 'comments';

interface BrandConfig {
  id: string;
  name: string;
  keywords: string[];
}

@Injectable({
  providedIn: 'root'
})
export class ApifyChartService {

  private readonly colorPalette = [
    '#3ecf8e', '#6366f1', '#f43f5e', '#f59e0b', '#0ea5e9',
    '#8b5cf6', '#a855f7', '#ec4899', '#14b8a6', '#f97316'
  ];

  // ==========================================
  // NORMALIZADOR ESCALABLE (MATRIZ DE MARCAS LATAM)
  // ==========================================
  private readonly BRAND_DICTIONARY: BrandConfig[] = [
    { id: 'hills', name: "Hill's Pet Nutrition", keywords: ['hill', 'science diet', 'hillspet'] },
    { id: 'purina', name: 'Purina Pro Plan', keywords: ['pro plan', 'proplan', 'purina'] },
    { id: 'royal', name: 'Royal Canin', keywords: ['royal canin', 'royalcanin'] },
    { id: 'nupec', name: 'Nupec', keywords: ['nupec'] },
    { id: 'agility', name: 'Agility Gold', keywords: ['agility'] },
    { id: 'chunky', name: 'Chunky Mascotas', keywords: ['chunky'] },
    { id: 'pets_table', name: "Pet's Table", keywords: ["pet's table", 'pets table'] },
    // FIX: Agregamos keywords ampliadas para asegurar que atrape a Virbac y Bonnat en cualquier red
    { id: 'virbac', name: 'Virbac', keywords: ['virbac', 'virbaccolombia'] },
    { id: 'bonnat', name: 'Bonnat', keywords: ['bonnat', 'bonnatpets', 'bonnatpetscol'] },
    { id: 'true_blue', name: 'True Blue', keywords: ['true blue', 'trueblue'] },
    { id: 'brit', name: 'Brit', keywords: ['brit'] },
    { id: 'bravery', name: 'Bravery', keywords: ['bravery'] },
    { id: 'b2b_media', name: 'Medios y Eventos B2B', keywords: ['pet industry', 'smartdogs', 'congreso', 'cvdc', 'balance dogs', 'orbit', 'familia_smartdogs'] }
  ];

  public getNormalizedBrandName(item: any): string {
    const rawName = item.ownerFullName || item.ownerUsername || item.channelName || item.pageName || item.authorMeta?.name || item.user?.name || 'Desconocido';
    const nameLower = rawName.toLowerCase();

    const matchedBrand = this.BRAND_DICTIONARY.find(brand =>
      brand.keywords.some(keyword => nameLower.includes(keyword))
    );

    if (matchedBrand) return matchedBrand.name;

    return 'Embajadores / Creadores';
  }

  // ==========================================
  // HELPERS INTERNOS
  // ==========================================

  private formatCompactNumber(value: number): string {
    if (!value || value === 0) return '0';
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'k';
    return String(value);
  }

  private extractDate(item: any): Date {
    const rawDate = item.timestamp || item.time || item.date || item.createTimeISO || item.createdAt || item.videoMeta?.createTime || item.createTime;
    if (item.createTime && typeof item.createTime === 'number') {
       return new Date(item.createTime < 10000000000 ? item.createTime * 1000 : item.createTime);
    }
    if (typeof rawDate === 'number' && rawDate < 10000000000) {
      return new Date(rawDate * 1000);
    }
    return rawDate ? new Date(rawDate) : new Date();
  }

  private getMetricValue(item: any, network: string, metric: ChartMetric): number {
    if (metric === 'views') {
      if (network === 'instagram') return item.videoPlayCount || item.videoViewCount || item.playCount || item.viewsCount || 0;
      if (network === 'tiktok') return item.playCount || item.stats?.playCount || item.videoMeta?.playCount || 0;
      return item.viewsCount || item.viewCount || item.playCount || item.videoPostViewCount || 0;
    }
    if (metric === 'likes') {
      if (network === 'tiktok') return item.diggCount || item.stats?.diggCount || item.videoMeta?.diggCount || 0;
      return item.likesCount || item.likes || item.diggCount || item.reactionLikeCount || 0;
    }
    if (metric === 'comments') {
      if (network === 'tiktok') return item.commentCount || item.stats?.commentCount || item.videoMeta?.commentCount || 0;
      return item.commentsCount || item.commentCount || item.comments || 0;
    }

    if (network === 'youtube') return item.viewCount || 0;
    if (network === 'tiktok') {
      const likes = item.diggCount || item.stats?.diggCount || item.videoMeta?.diggCount || 0;
      const comments = item.commentCount || item.stats?.commentCount || item.videoMeta?.commentCount || 0;
      const shares = item.shareCount || item.stats?.shareCount || item.videoMeta?.shareCount || 0;
      return likes + comments + shares;
    }
    if (network === 'facebook') return (item.likes || 0) + (item.comments || 0) + (item.shares || 0);

    return (item.likesCount || item.likes || 0) + (item.commentsCount || item.comments || 0);
  }

  private getMetricLabel(metric: ChartMetric): string {
    const labels: Record<ChartMetric, string> = {
      'total': 'Engagement (Interacciones Totales)',
      'views': 'Vistas / Reproducciones',
      'likes': 'Me Gusta (Likes)',
      'comments': 'Comentarios'
    };
    return labels[metric];
  }

  // ==========================================
  // GRÁFICOS
  // ==========================================

  buildChartOptions(network: string, rawData: any[], metric: ChartMetric = 'total'): EChartsOption {
    const metricName = this.getMetricLabel(metric);
    const dates = rawData.map(i => this.extractDate(i)).filter(d => !isNaN(d.getTime()));

    if (dates.length === 0) return {};

    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    const diffDays = (maxDate.getTime() - minDate.getTime()) / (1000 * 3600 * 24);

    const isDaily = diffDays <= 60;

    const getFormatKey = (d: Date) => {
      return isDaily
        ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        : `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    };

    const uniqueTimeKeys = Array.from(new Set(dates.map(d => getFormatKey(d)))).sort();

    const xAxisLabels = uniqueTimeKeys.map(key => {
      if (isDaily) {
        const [y,m,d] = key.split('-');
        return `${d} ${new Date(parseInt(y), parseInt(m)-1).toLocaleDateString('es-ES', {month: 'short'})}`;
      } else {
        const [y,m] = key.split('-');
        return new Date(parseInt(y), parseInt(m)-1).toLocaleDateString('es-ES', {month: 'short', year: 'numeric'});
      }
    });

    const groupedData: Record<string, Record<string, number>> = {};

    rawData.forEach(item => {
      const authorName = this.getNormalizedBrandName(item);
      const timeKey = getFormatKey(this.extractDate(item));
      const value = this.getMetricValue(item, network, metric);

      if (!groupedData[authorName]) {
        groupedData[authorName] = {};
        uniqueTimeKeys.forEach(k => groupedData[authorName][k] = 0);
      }
      if(groupedData[authorName][timeKey] !== undefined) {
         groupedData[authorName][timeKey] += value;
      }
    });

    const seriesConfig: any[] = [];
    const legendData: string[] = Object.keys(groupedData);

    Object.entries(groupedData).forEach(([author, timeData], index) => {
      const seriesData = uniqueTimeKeys.map(key => timeData[key]);
      seriesConfig.push({
        name: author,
        type: 'line',
        smooth: true,
        symbolSize: 8,
        areaStyle: { opacity: 0.05 },
        data: seriesData,
        itemStyle: { color: this.colorPalette[index % this.colorPalette.length] },
        animationDuration: 1500,
        animationEasing: 'cubicOut'
      });
    });

    return {
      title: { text: `Evolución: ${metricName}`, subtext: `Tendencia de crecimiento por ${isDaily ? 'día' : 'mes'}`, textStyle: { fontFamily: 'Lato', fontSize: 16, color: '#111827' } },
      tooltip: { trigger: 'axis', backgroundColor: 'rgba(255, 255, 255, 0.98)', textStyle: { fontFamily: 'Lato' } },
      legend: { data: legendData, top: 60, textStyle: { fontFamily: 'Lato' } },
      grid: { left: '3%', right: '4%', bottom: '5%', top: 110, containLabel: true },
      xAxis: { type: 'category', boundaryGap: false, data: xAxisLabels, axisLabel: { fontFamily: 'Lato' } },
      yAxis: { type: 'value', axisLabel: { fontFamily: 'Lato', formatter: (val: number) => this.formatCompactNumber(val) } },
      series: seriesConfig
    };
  }

  buildMarketShareChart(network: string, rawData: any[], metric: ChartMetric = 'total'): EChartsOption {
    const aggregatedData: Record<string, number> = {};
    const metricName = this.getMetricLabel(metric);

    let hasData = false;

    rawData.forEach(item => {
      const authorName = this.getNormalizedBrandName(item);
      const value = this.getMetricValue(item, network, metric);
      if (!aggregatedData[authorName]) aggregatedData[authorName] = 0;
      aggregatedData[authorName] += value;
      if (value > 0) hasData = true;
    });

    if (!hasData) {
      return {
        title: { text: 'Cuota de Mercado (Market Share)', subtext: `No hay datos de ${metricName}`, left: 'center', textStyle: { fontFamily: 'Lato', fontSize: 16, color: '#111827' } },
        series: [{
          name: 'Sin datos', type: 'pie', radius: ['35%', '50%'], center: ['50%', '50%'],
          itemStyle: { color: '#e5e7eb' },
          label: { show: false },
          data: [{ name: 'Sin registros', value: 1 }]
        }]
      };
    }

    const pieData = Object.entries(aggregatedData)
      .map(([name, value], index) => ({
        name, value, itemStyle: { color: this.colorPalette[index % this.colorPalette.length] }
      }));

    return {
      title: { text: 'Cuota de Mercado (Market Share)', subtext: `Basado en ${metricName}`, left: 'center', textStyle: { fontFamily: 'Lato', fontSize: 16, color: '#111827' } },
      tooltip: { trigger: 'item', formatter: '<b>{b}</b><br/>{c} ({d}%)', backgroundColor: 'rgba(255, 255, 255, 0.98)' },
      legend: { orient: 'horizontal', bottom: 0, textStyle: { fontFamily: 'Lato', fontSize: 11 } },
      series: [
        {
          name: metricName, type: 'pie', radius: ['35%', '50%'], center: ['50%', '50%'], avoidLabelOverlap: true,
          itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, formatter: '{b}\n{d}%', fontWeight: 'bold', fontFamily: 'Lato', fontSize: 11, color: '#4b5563' },
          labelLine: { show: true, smooth: 0.2, length: 5, length2: 10 },
          data: pieData
        }
      ]
    };
  }

  buildPerformanceScatterChart(network: string, rawData: any[]): EChartsOption {
    const groupedData: Record<string, any[]> = {};

    rawData.forEach(item => {
      const authorName = this.getNormalizedBrandName(item);
      if (!groupedData[authorName]) groupedData[authorName] = [];
      groupedData[authorName].push(item);
    });

    const seriesConfig: any[] = [];
    const legendData: string[] = Object.keys(groupedData);

    Object.entries(groupedData).forEach(([author, items], index) => {
      const seriesData = items.map(i => {
        const views = this.getMetricValue(i, network, 'views');
        const engagement = this.getMetricValue(i, network, 'total');
        const comments = this.getMetricValue(i, network, 'comments') || 5;
        return { value: [views, engagement, comments], meta: i };
      });

      seriesConfig.push({
        name: author, type: 'scatter', symbolSize: (data: any) => Math.min(Math.max(data[2] * 2, 15), 50),
        data: seriesData,
        itemStyle: { color: this.colorPalette[index % this.colorPalette.length], opacity: 0.7, borderColor: '#ffffff', borderWidth: 1.5, shadowBlur: 10, shadowColor: 'rgba(0, 0, 0, 0.1)' }
      });
    });

    return {
      title: { text: 'Cuadrante de Calidad de Contenido', subtext: 'Eje X: Vistas (Alcance) | Eje Y: Interacciones | Tamaño: Comentarios', textStyle: { fontFamily: 'Lato', fontSize: 16, color: '#111827' } },
      tooltip: {
        trigger: 'item', backgroundColor: 'rgba(255, 255, 255, 0.98)', borderColor: '#e5e7eb', padding: 12,
        formatter: (params: any) => {
          const meta = params.data.meta;
          const title = meta.caption || meta.title || meta.text || 'Contenido visual';
          const shortTitle = title.length > 60 ? title.substring(0, 60) + '...' : title;
          return `
            <div style="max-width: 300px; white-space: normal;">
              <strong style="color: ${params.color}; font-size: 14px;">${params.seriesName}</strong><br/>
              <span style="font-size: 12px; color: #6b7280;">"${shortTitle}"</span>
              <hr style="margin: 8px 0; border: 0; border-top: 1px solid #e5e7eb;" />
              👁️ Vistas: <b>${params.value[0].toLocaleString()}</b><br/>
              📈 Engagement: <b>${params.value[1].toLocaleString()}</b><br/>
              💬 Comentarios: <b>${params.value[2].toLocaleString()}</b>
            </div>
          `;
        }
      },
      legend: { data: legendData, top: 65, textStyle: { fontFamily: 'Lato' } },
      grid: { left: '5%', right: '8%', bottom: '10%', top: 120, containLabel: true },
      xAxis: { type: 'value', name: 'Vistas (Alcance)', nameLocation: 'middle', nameGap: 30, splitLine: { lineStyle: { type: 'dashed', color: '#e5e7eb' } }, axisLabel: { formatter: (val: number) => this.formatCompactNumber(val) } },
      yAxis: { type: 'value', name: 'Engagement Total', splitLine: { lineStyle: { type: 'dashed', color: '#e5e7eb' } }, axisLabel: { formatter: (val: number) => this.formatCompactNumber(val) } },
      series: seriesConfig
    };
  }

  buildMasterOmnichannelChart(aggregatedData: any[], metric: ChartMetric = 'total'): EChartsOption {
    const metricName = this.getMetricLabel(metric);
    const networks = ['facebook', 'instagram', 'tiktok', 'youtube'];
    const displayNetworks = ['Facebook', 'Instagram', 'TikTok', 'YouTube'];

    const brandNetworkMap: Record<string, Record<string, number>> = {};

    aggregatedData.forEach(item => {
       const net = item.__network || 'unknown';
       const authorName = this.getNormalizedBrandName(item);
       const val = this.getMetricValue(item, net, metric);

       if (!brandNetworkMap[authorName]) {
         brandNetworkMap[authorName] = { facebook: 0, instagram: 0, tiktok: 0, youtube: 0 };
       }
       if (networks.includes(net)) {
         brandNetworkMap[authorName][net] += val;
       }
    });

    const seriesConfig: any[] = [];
    const legendData = Object.keys(brandNetworkMap);

    Object.entries(brandNetworkMap).forEach(([brand, netData], index) => {
       seriesConfig.push({
         name: brand,
         type: 'bar',
         data: networks.map(n => netData[n]),
         itemStyle: { color: this.colorPalette[index % this.colorPalette.length], borderRadius: [4, 4, 0, 0] },
         label: {
           show: true, position: 'top', fontFamily: 'Lato', fontSize: 10, color: '#6b7280',
           formatter: (p: any) => p.value > 0 ? this.formatCompactNumber(p.value) : ''
         }
       });
    });

    return {
      title: { text: `Share of Voice Omnicanal`, subtext: `Comparativa de ${metricName} en todo el Ecosistema Digital`, textStyle: { fontFamily: 'Lato', fontSize: 16, color: '#111827' } },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: 'rgba(255, 255, 255, 0.98)', textStyle: { fontFamily: 'Lato' } },
      legend: { data: legendData, top: 60, textStyle: { fontFamily: 'Lato' } },
      grid: { left: '3%', right: '4%', bottom: '5%', top: 110, containLabel: true },
      xAxis: { type: 'category', data: displayNetworks, axisLabel: { fontFamily: 'Lato', fontWeight: 'bold' } },
      yAxis: { type: 'value', axisLabel: { fontFamily: 'Lato', formatter: (val: number) => this.formatCompactNumber(val) } },
      series: seriesConfig
    };
  }
}
