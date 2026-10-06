import { Component } from '@angular/core';
import { FeaturePageComponent } from './feature-page.component';

@Component({selector:'tc-child-profile',standalone:true,imports:[FeaturePageComponent],template:`<tc-feature-page sectionId="children" />`})
export class ChildProfileComponent {}
@Component({selector:'tc-medication-tracker',standalone:true,imports:[FeaturePageComponent],template:`<tc-feature-page sectionId="medications" />`})
export class MedicationTrackerComponent {}
@Component({selector:'tc-health-events',standalone:true,imports:[FeaturePageComponent],template:`<tc-feature-page sectionId="health_events" />`})
export class HealthEventsComponent {}
@Component({selector:'tc-therapy-tracker',standalone:true,imports:[FeaturePageComponent],template:`<tc-feature-page sectionId="therapies" />`})
export class TherapyTrackerComponent {}
@Component({selector:'tc-document-vault',standalone:true,imports:[FeaturePageComponent],template:`<tc-feature-page sectionId="documents" />`})
export class DocumentVaultComponent {}
@Component({selector:'tc-expense-tracker',standalone:true,imports:[FeaturePageComponent],template:`<tc-feature-page sectionId="expenses" />`})
export class ExpenseTrackerComponent {}
@Component({selector:'tc-doctor-report',standalone:true,imports:[FeaturePageComponent],template:`<tc-feature-page sectionId="reports" />`})
export class DoctorReportComponent {}
