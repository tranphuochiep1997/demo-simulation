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
        path: '**',
        redirectTo: '/cesium-viewer'
    }
];
