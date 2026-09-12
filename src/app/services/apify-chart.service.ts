// src/app/services/apify-chart.service.ts
import { Injectable } from '@angular/core';
import type { EChartsOption } from 'echarts';

@Injectable({
  providedIn: 'root'
})
export class ApifyChartService {

  /**
   * Patrón Factory/Builder: Recibe los datos crudos y la red social,
   * y devuelve la configuración exacta y enriquecida lista para ECharts.
   */
  buildChartOptions(network: string, rawData: any[]): EChartsOption {
    const groupedData: Record<string, any[]> = {};
    let metricName = 'Métrica';
    let itemLabel = 'Post';

    // 1. Contexto inteligente según la plataforma
    if (network === 'youtube' || network === 'tiktok') itemLabel = 'Video';
    else if (network === 'facebook' || network === 'instagram') itemLabel = 'Publicación';

    // 2. Ordenamiento cronológico para comparar líneas de tiempo reales
    const sortedData = [...rawData].sort((a, b) => {
      const dateA = new Date(a.date || a.timestamp || a.createdAt || 0).getTime();
      const dateB = new Date(b.date || b.timestamp || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    // 3. Data Blending: Agrupación de datos por Marca/Canal
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

    // 4. Construcción de las Series para ECharts
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

    // 5. Retornamos el objeto de configuración puro
    return {
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
  }
}
