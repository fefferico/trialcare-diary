import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { ChildProfileComponent, DoctorReportComponent, DocumentVaultComponent, ExpenseTrackerComponent, HealthEventsComponent, MedicationTrackerComponent, TherapyTrackerComponent } from './features/section-wrappers';

export const routes: Routes = [
  { path:'dashboard', component:DashboardComponent },
  { path:'children', component:ChildProfileComponent },
  { path:'medications', component:MedicationTrackerComponent },
  { path:'health_events', component:HealthEventsComponent },
  { path:'therapies', component:TherapyTrackerComponent },
  { path:'documents', component:DocumentVaultComponent },
  { path:'expenses', component:ExpenseTrackerComponent },
  { path:'reports', component:DoctorReportComponent },
  { path:'', redirectTo:'dashboard', pathMatch:'full' },
  { path:'**', redirectTo:'dashboard' },
];
