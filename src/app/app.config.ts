// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';

// 1. Importamos el proveedor de ECharts
import { provideEchartsCore  } from 'ngx-echarts';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),

    // 2. Registramos ECharts globalmente usando Lazy Loading
    // Esto asegura que el núcleo pesado de ECharts solo se descargue
    // cuando un componente realmente vaya a renderizar una gráfica.
    provideEchartsCore ({
      echarts: () => import('echarts')
    })
  ]
};
