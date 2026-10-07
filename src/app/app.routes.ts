import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import {
  ChildProfileComponent,
  ContactsComponent,
  DoctorReportComponent,
  DocumentVaultComponent,
  ExpenseTrackerComponent,
  HealthEventsComponent,
  MedicationTrackerComponent,
  MedicineCabinetComponent,
  OrthosesComponent,
  TherapyTrackerComponent,
} from './features/section-wrappers';
import { requireAuthentication } from './core/auth.guard';
import { CalendarComponent } from './features/calendar/calendar.component';

export const routes: Routes = [
  { path: 'dashboard', component: DashboardComponent, canActivate: [requireAuthentication] },
  { path: 'calendar', component: CalendarComponent, canActivate: [requireAuthentication] },
  { path: 'children', component: ChildProfileComponent, canActivate: [requireAuthentication] },
  {
    path: 'medications',
    component: MedicationTrackerComponent,
    canActivate: [requireAuthentication],
  },
  {
    path: 'medicine-cabinet',
    component: MedicineCabinetComponent,
    canActivate: [requireAuthentication],
  },
  { path: 'orthoses', component: OrthosesComponent, canActivate: [requireAuthentication] },
  { path: 'medicine_cabinet', redirectTo: 'medicine-cabinet', pathMatch: 'full' },
  { path: 'health_events', component: HealthEventsComponent, canActivate: [requireAuthentication] },
  { path: 'therapies', component: TherapyTrackerComponent, canActivate: [requireAuthentication] },
  { path: 'documents', component: DocumentVaultComponent, canActivate: [requireAuthentication] },
  { path: 'expenses', component: ExpenseTrackerComponent, canActivate: [requireAuthentication] },
  { path: 'contacts', component: ContactsComponent, canActivate: [requireAuthentication] },
  { path: 'reports', component: DoctorReportComponent, canActivate: [requireAuthentication] },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: 'dashboard' },
];
