// src/app/app.component.ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
// 1. Importamos la referencia estricta de nuestro nuevo componente
import { ApifyViewerComponent } from './components/apify-viewer/apify-viewer.component';

@Component({
  selector: 'app-root',
  standalone: true,
  // 2. Inyectamos el componente en el array de dependencias locales (imports)
  imports: [RouterOutlet, ApifyViewerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'market-data-app';
}
