import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

window.CESIUM_BASE_URL = '/static/Cesium/';

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
