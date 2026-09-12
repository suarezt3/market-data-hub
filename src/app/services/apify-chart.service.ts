// src/app/services/apify-chart.service.ts
import { Injectable } from '@angular/core';
import type { EChartsOption } from 'echarts';

// Definimos un tipo estricto para los filtros permitidos
export type ChartMetric = 'total' | 'views' | 'likes' | 'comments';

@Injectable({
  providedIn: 'root'
})
export class ApifyChartService {

  private readonly colorPalette = ['#3ecf8e', '#6366f1', '#f43f5e', '#f59e0b', '#0ea5e9', '#8b5cf6'];

  /**
   * Helper privado (DRY): Extrae y unifica la métrica solicitada sin importar
   * las diferencias de formato entre JSONs de Facebook, YT, TikTok, etc.
   */
  private getMetricValue(item: any, network: string, metric: ChartMetric): number {
    if (metric === 'views') {
      return item.viewsCount || item.viewCount || item.playCount || item.videoPostViewCount || 0;
    }
    if (metric === 'likes') {
      return item.likes || item.likesCount || item.reactionLikeCount || 0;
    }
    if (metric === 'comments') {
      return item.comments || item.commentsCount || 0;
    }

    // Si el filtro es 'total' (Engagement / Métrica principal)
    if (network === 'youtube') return item.viewCount || 0;
    if (network === 'tiktok') return item.playCount || 0;
    if (network === 'facebook') return (item.likes || 0) + (item.comments || 0) + (item.shares || 0);
    return (item.likesCount || item.likes || 0) + (item.commentsCount || item.comments || 0);
  }

  /**
   * Helper para obtener el nombre legible de la métrica a mostrar en las gráficas
   */
  private getMetricLabel(metric: ChartMetric): string {
    const labels: Record<ChartMetric, string> = {
      'total': 'Engagement (Interacciones Totales)',
      'views': 'Vistas / Reproducciones',
      'likes': 'Me Gusta (Likes)',
      'comments': 'Comentarios'
    };
    return labels[metric];
  }

  // 1. GRÁFICO CRONOLÓGICO
  buildChartOptions(network: string, rawData: any[], metric: ChartMetric = 'total'): EChartsOption {
    const groupedData: Record<string, any[]> = {};
    const metricName = this.getMetricLabel(metric);
    let itemLabel = (network === 'youtube' || network === 'tiktok') ? 'Video' : 'Publicación';

    const sortedData = [...rawData].sort((a, b) => {
      const dateA = new Date(a.time || a.date || a.timestamp || a.createdAt || 0).getTime();
      const dateB = new Date(b.time || b.date || b.timestamp || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    sortedData.forEach(item => {
      let authorName = item.channelName || item.pageName || item.authorMeta?.name || item.ownerUsername || item.user?.name || 'Competidor';
      if (!groupedData[authorName]) groupedData[authorName] = [];
      groupedData[authorName].push(item);
    });

    const seriesConfig: any[] = [];
    const legendData: string[] = Object.keys(groupedData);
    let maxItems = 0;

    Object.entries(groupedData).forEach(([author, items], index) => {
      if (items.length > maxItems) maxItems = items.length;

      const seriesData = items.slice(0, 15).map(i => {
        // Usamos nuestro nuevo helper para extraer el valor exacto filtrado
        const val = this.getMetricValue(i, network, metric);
        return { value: val, meta: i };
      });

      seriesConfig.push({
        name: author,
        type: 'bar',
        data: seriesData,
        itemStyle: { color: this.colorPalette[index % this.colorPalette.length], borderRadius: [4, 4, 0, 0] },
        animationDuration: 1000, // Animación un poco más rápida para cuando el usuario cambia de filtro
        animationEasing: 'cubicOut'
      });
    });

    const xAxisLabels = Array.from({ length: Math.min(maxItems, 15) }, (_, i) => `${itemLabel} ${i + 1}`);

    return {
      title: { text: `Rendimiento: ${metricName}`, textStyle: { fontFamily: 'Lato', fontSize: 16, color: '#111827' } },
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
          const dateStr = meta.time || meta.date || meta.timestamp;
          const date = dateStr ? new Date(dateStr).toLocaleDateString() : 'Fecha desconocida';

          return `
            <div style="max-width: 320px; white-space: normal;">
              <strong style="color: ${params.color}; font-size: 14px;">${params.seriesName}</strong>
              <hr style="margin: 8px 0; border: 0; border-top: 1px solid #e5e7eb;" />
              <div style="font-size: 12px; color: #6b7280; margin-bottom: 4px;">📅 Publicado: ${date}</div>
              <div style="font-weight: 600; font-size: 13px; line-height: 1.4; margin-bottom: 12px;">"${shortTitle}"</div>
              <div style="display: flex; justify-content: space-between; font-size: 13px; background: #f9fafb; padding: 6px; border-radius: 4px;">
                <span>📊 <b>${params.value.toLocaleString()}</b> ${metricName}</span>
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
  }

  // 2. GRÁFICO DE CUOTA DE MERCADO
  buildMarketShareChart(network: string, rawData: any[], metric: ChartMetric = 'total'): EChartsOption {
    const aggregatedData: Record<string, number> = {};
    const metricName = this.getMetricLabel(metric);

    rawData.forEach(item => {
      let authorName = item.channelName || item.pageName || item.authorMeta?.name || item.ownerUsername || item.user?.name || 'Competidor';
      // Usamos nuestro helper para agregar exactamente lo que el usuario filtró
      const value = this.getMetricValue(item, network, metric);

      if (!aggregatedData[authorName]) aggregatedData[authorName] = 0;
      aggregatedData[authorName] += value;
    });

    const pieData = Object.entries(aggregatedData).map(([name, value], index) => ({
      name,
      value,
      itemStyle: { color: this.colorPalette[index % this.colorPalette.length] }
    }));

    return {
      title: {
        text: 'Cuota de Mercado (Market Share)',
        subtext: `Basado en ${metricName}`,
        left: 'center',
        textStyle: { fontFamily: 'Lato', fontSize: 16, color: '#111827' }
      },
      tooltip: {
        trigger: 'item',
        formatter: '<b>{b}</b><br/>{c} ({d}%)',
        textStyle: { fontFamily: 'Lato' },
        backgroundColor: 'rgba(255, 255, 255, 0.98)'
      },
      legend: { orient: 'horizontal', bottom: 0, textStyle: { fontFamily: 'Lato' } },
      series: [
        {
          name: metricName,
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 8, borderColor: '#fff', borderWidth: 2 },
          label: { show: false, position: 'center' },
          emphasis: { label: { show: true, fontSize: 16, fontWeight: 'bold', fontFamily: 'Lato' } },
          labelLine: { show: false },
          data: pieData
        }
      ]
    };
  }
}
