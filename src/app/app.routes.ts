import { Routes } from '@angular/router';

export const routes: Routes = [
    { 
        path: 'cesium-viewer', 
        loadComponent: () => import('./features/cesium-viewer/cesium-viewer.component').then(m => m.CesiumViewerComponent)
    },
    { 
        path: 'flood-simulation', 
        loadComponent: () => import('./features/cesium-flood-simulation/cesium-flood-simulation.component').then(m => m.CesiumFloodSimulationComponent)
    },
    { 
        path: 'bieu-do-thuy-dien', 
        loadComponent: () => import('./features/bieu-do-thuy-dien/bieu-do-thuy-dien').then(m => m.BieuDoThuyDien)
    },
    {
        path: '**',
        redirectTo: '/cesium-viewer'
    }
];
