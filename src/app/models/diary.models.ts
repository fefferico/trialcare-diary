export type SectionId =
  | 'children'
  | 'medications'
  | 'medicine_cabinet'
  | 'health_events'
  | 'therapies'
  | 'documents'
  | 'expenses'
  | 'contacts'
  | 'reports';
export type FieldKind = 'text' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'file';
export interface FieldDefinition {
  key: string;
  label: string;
  kind: FieldKind;
  options?: string[];
  required?: boolean;
  placeholder?: string;
}
export interface SectionDefinition {
  id: SectionId;
  label: string;
  shortLabel: string;
  title: string;
  description: string;
  icon: string;
  fields: FieldDefinition[];
}
export interface DiaryRow {
  id: string;
  user_id?: string;
  child_id?: string;
  created_at?: string;
  [key: string]: unknown;
}
export interface ChildRow extends DiaryRow {
  name: string;
  birth_date: string;
  trial_id: string;
}
export interface ExpenseRow extends DiaryRow {
  title: string;
  category: string;
  amount: number;
  distance_km?: number;
  rate_per_km?: number;
  date: string;
}
export interface ReportSummary {
  label: string;
  value: string;
  detail: string;
  icon: string;
}

export const SECTIONS: SectionDefinition[] = [
  {
    id: 'children',
    label: 'Bambini',
    shortLabel: 'Bimbi',
    title: 'Profili bambini',
    description: 'Tieni a portata di mano i dati del bambino e i riferimenti del trial.',
    icon: 'users',
    fields: [
      { key: 'name', label: 'Nome e cognome', kind: 'text', required: true },
      { key: 'birth_date', label: 'Data di nascita', kind: 'date', required: true },
      { key: 'trial_id', label: 'ID trial clinico', kind: 'text' },
      { key: 'blood_group', label: 'Gruppo sanguigno', kind: 'select', options: ['A+','A−','B+','B−','AB+','AB−','0+','0−','Non noto'] },
      { key: 'allergies', label: 'Allergie e reazioni avverse', kind: 'textarea' },
      { key: 'medical_conditions', label: 'Condizioni cliniche rilevanti', kind: 'textarea' },
      { key: 'medical_alerts', label: 'Indicazioni importanti per le emergenze', kind: 'textarea' },
      { key: 'emergency_contact', label: 'Contatto di emergenza', kind: 'text' },
      { key: 'clinical_team', label: 'Team clinico', kind: 'textarea' },
    ],
  },
  {
    id: 'medications',
    label: 'Terapia farmacologica',
    shortLabel: 'Terapia farmacologica',
    title: 'Terapia farmacologica',
    description: 'Dosaggi, orari e pause programmate, organizzati in un unico posto.',
    icon: 'pill',
    fields: [
      { key: 'name', label: 'Farmaco', kind: 'text', required: true },
      { key: 'dosage', label: 'Dosaggio', kind: 'text', required: true },
      {
        key: 'formulation',
        label: 'Formulazione',
        kind: 'select',
        options: ['Compressa', 'Sciroppo', 'Gocce', 'Spray', 'Crema', 'Altro'],
      },
      { key: 'start_date', label: 'Dal', kind: 'date' },
      { key: 'end_date', label: 'Al', kind: 'date' },
      { key: 'schedule_times', label: 'Orari (es. 08:00, 14:00)', kind: 'text' },
      { key: 'planned_pause', label: 'Pause programmate', kind: 'textarea' },
    ],
  },
  {
    id: 'medicine_cabinet',
    label: 'Farmaci in casa',
    shortLabel: 'Scorte',
    title: 'Inventario dei farmaci in casa',
    description:
      'Tieni sotto controllo confezioni, dosaggio previsto, prezzo e date di apertura e scadenza.',
    icon: 'pill',
    fields: [
      { key: 'name', label: 'Nome del farmaco', kind: 'text', required: true },
      {
        key: 'quantity',
        label: 'Confezioni o quantità disponibili',
        kind: 'text',
        placeholder: 'Es. 1 confezione, 20 ml',
      },
      {
        key: 'planned_dosage',
        label: 'Dosaggio previsto',
        kind: 'text',
        placeholder: 'Come indicato dal team clinico',
      },
      { key: 'price', label: 'Prezzo (€)', kind: 'number' },
      { key: 'purchase_date', label: 'Data di acquisto', kind: 'date' },
      { key: 'opened_date', label: 'Data di apertura', kind: 'date' },
      { key: 'expiry_date', label: 'Data di scadenza', kind: 'date' },
      { key: 'notes', label: 'Note', kind: 'textarea' },
    ],
  },
  {
    id: 'health_events',
    label: 'Eventi e sintomi',
    shortLabel: 'Eventi',
    title: 'Eventi di salute',
    description: 'Annota sintomi, traumi ed eventi inattesi da condividere con il medico.',
    icon: 'activity',
    fields: [
      { key: 'title', label: 'Evento', kind: 'text', required: true },
      {
        key: 'category',
        label: 'Categoria',
        kind: 'select',
        options: ['Febbre', 'Tosse', 'Broncospasmo', 'Trauma', 'Evento avverso', 'Altro'],
      },
      { key: 'date', label: 'Data', kind: 'date', required: true },
      { key: 'time', label: 'Ora', kind: 'time' },
      {
        key: 'severity',
        label: 'Intensità',
        kind: 'select',
        options: ['Lieve', 'Moderata', 'Intensa'],
      },
      { key: 'notes', label: 'Note cliniche', kind: 'textarea' },
    ],
  },
  {
    id: 'therapies',
    label: 'Percorsi terapeutici',
    shortLabel: 'Percorsi terapeutici',
    title: 'Percorsi terapeutici',
    description: 'Registra sedute, professionisti e indicazioni utili.',
    icon: 'heart-handshake',
    fields: [
      { key: 'name', label: 'Tipologia di terapia', kind: 'text', required: true },
      { key: 'therapist', label: 'Terapista', kind: 'text' },
      { key: 'facility', label: 'Centro o struttura', kind: 'text' },
      { key: 'frequency', label: 'Frequenza', kind: 'text' },
      { key: 'start_date', label: 'Data inizio', kind: 'date' },
      { key: 'notes', label: 'Note', kind: 'textarea' },
    ],
  },
  {
    id: 'documents',
    label: 'Documenti',
    shortLabel: 'File',
    title: 'Documenti clinici',
    description: 'Conserva prescrizioni, referti e immagini in uno spazio protetto.',
    icon: 'folder',
    fields: [
      { key: 'title', label: 'Titolo documento', kind: 'text', required: true },
      {
        key: 'category',
        label: 'Tipo documento',
        kind: 'select',
        options: ['Prescrizione', 'Referto', 'Immagine', 'Lettera clinica', 'Altro'],
      },
      { key: 'date', label: 'Data documento', kind: 'date' },
      { key: 'file', label: 'Allegato', kind: 'file', required: true },
      { key: 'notes', label: 'Note', kind: 'textarea' },
    ],
  },
  {
    id: 'expenses',
    label: 'Spese e rimborsi',
    shortLabel: 'Spese',
    title: 'Note spese',
    description: 'Calcola chilometri e pasti rimborsabili per ogni visita.',
    icon: 'receipt',
    fields: [
      { key: 'title', label: 'Descrizione', kind: 'text', required: true },
      {
        key: 'category',
        label: 'Voce di spesa',
        kind: 'select',
        options: ['Viaggio', 'Colazione', 'Pranzo', 'Cena', 'Pedaggio', 'Parcheggio', 'Altro'],
      },
      { key: 'date', label: 'Data', kind: 'date', required: true },
      { key: 'amount', label: 'Importo (€)', kind: 'number' },
      { key: 'distance_km', label: 'Chilometri', kind: 'number' },
      { key: 'rate_per_km', label: 'Tariffa €/km', kind: 'number' },
      { key: 'receipt', label: 'Scontrino o ricevuta', kind: 'file' },
      { key: 'notes', label: 'Note', kind: 'textarea' },
    ],
  },
  {
    id: 'contacts',
    label: 'Contatti',
    shortLabel: 'Contatti',
    title: 'Contatti utili',
    description:
      'Numeri e riferimenti del team clinico, dei servizi e delle persone da raggiungere al volo.',
    icon: 'contacts',
    fields: [
      { key: 'name', label: 'Nome e cognome', kind: 'text', required: true },
      {
        key: 'role',
        label: 'Ruolo o specialità',
        kind: 'text',
        required: true,
        placeholder: 'Es. pediatra, coordinatore trial',
      },
      {
        key: 'category',
        label: 'Categoria',
        kind: 'select',
        options: ['Team clinico', 'Centro trial', 'Emergenze', 'Farmacia', 'Terapista', 'Altro'],
        required: true,
      },
      { key: 'phone', label: 'Telefono', kind: 'text', placeholder: '+39 …' },
      { key: 'email', label: 'Email', kind: 'text' },
      { key: 'facility', label: 'Struttura', kind: 'text' },
      { key: 'notes', label: 'Note utili', kind: 'textarea' },
    ],
  },
  {
    id: 'reports',
    label: 'Report',
    shortLabel: 'Report',
    title: 'Report per il team clinico',
    description:
      'Riepiloga farmaci, eventi, terapie, documenti e spese da condividere durante la visita.',
    icon: 'report',
    fields: [],
  },
];

export function sectionById(id: string): SectionDefinition | undefined {
  return SECTIONS.find((section) => section.id === id);
}
