import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/form-demo.component').then((m) => m.FormDemoComponent),
  },
  {
    path: 'builder',
    loadComponent: () =>
      import('./form-builder/form-builder.component').then((m) => m.FormBuilderComponent),
  },
  { path: '**', redirectTo: '' },
];
