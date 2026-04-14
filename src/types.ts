export type UnitType = 'SESI' | 'SENAI';

export interface MonthData {
  metaMes?: number;
  realizadoMes?: number;
  metaTrim?: number;
  realizadoTrim?: number;
  // Enrollment data (moved to Efficiency but kept in model)
  metaMatMes?: number;
  realMatMes?: number;
  metaHaMes?: number;
  realHaMes?: number;
  metaMatTrim?: number;
  realMatTrim?: number;
  metaHaTrim?: number;
  realHaTrim?: number;
  // Quality pillar (Evasion)
  metaEvasaoMes?: number;
  realEvasaoMes?: number;
  metaEvasaoTrim?: number;
  realEvasaoTrim?: number;
}

export interface CostCenter {
  nome: string;
  metaMes: number;
  realizadoMes: number;
  metaTrim: number;
  realizadoTrim: number;
}

export interface ModalityData {
  nome: string;
  metaMatMes?: number;
  realMatMes?: number;
  metaHaMes?: number;
  realHaMes?: number;
  metaMatTrim?: number;
  realMatTrim?: number;
  metaHaTrim?: number;
  realHaTrim?: number;
  // Quality pillar (Evasion)
  metaEvasao?: number;
  realEvasao?: number;
}

export interface ProductData {
  nome: string;
  metaMes: number;
  realizadoMes: number;
  metaTrim: number;
  realizadoTrim: number;
}

export interface PillarData {
  titulo: string;
  subtitulo: string;
  meses: Record<number, MonthData>;
  centrosCusto?: {
    receita: CostCenter[];
    despesa: CostCenter[];
  };
  modalidades?: ModalityData[];
  produtos?: ProductData[];
}

export interface Unit {
  id: string;
  nome: string;
  tipo: UnitType;
  tag: string;
  tema: 'azul-verde' | 'azul-laranja';
  pilares: {
    eficiencia: PillarData;
    qualidade: PillarData;
    crescimento: PillarData;
  };
}

export interface ImportedBreakdown {
  total: number;
  pj: number;
  pf: number;
}

export interface ImportedCostCenter {
  id: string;
  name: string;
  revenue: ImportedBreakdown;
  expense: ImportedBreakdown;
  revenueCompanies: { name: string; value: number }[]; // PJ companies for revenue
  expenseCompanies: { name: string; value: number }[]; // PJ companies for expenses (suppliers)
  accountingGroups: { name: string; value: number }[]; // Accounting groups for expenses
}

export interface ImportedBusinessUnit {
  id: string;
  name: string;
  costCenters: ImportedCostCenter[];
  revenue: ImportedBreakdown;
  expense: ImportedBreakdown;
}

export interface CustomGoal {
  metaMes: number; // This can be the default or current month's meta
  metaAnual: number;
  metasMensais?: number[]; // Array of 12 values
  deleted?: boolean;
}

export interface ImportHistoryEntry {
  id: string;
  timestamp: string;
  userEmail: string;
  fileName: string;
  data: Record<string, Record<number, ImportedBusinessUnit>>;
}

export interface AppState {
  telaAtiva: 1 | 2 | 3 | 4 | 5 | 6; // 4 for Import, 5 for Goals, 6 for History
  unidadeSelecionada: string | null;
  pilarSelecionado: 'eficiencia' | 'qualidade' | 'crescimento' | null;
  mesAtual: number; // Represents the start month or the single selected month
  mesFim: number;   // Represents the end month of the range
  filtroModo: 'mes' | 'trimestre' | 'periodo';
  anoAtual: number;
  trimestreAtivo: 1 | 2 | 3 | 4;
  importedData: Record<string, Record<number, ImportedBusinessUnit>>; // Map of unitId to (Map of month to data)
  importedDataUpdatedAt?: string | null;
  importHistory: ImportHistoryEntry[];
  customGoals: Record<string, { // unitId
    eficiencia: {
      receita: Record<string, CustomGoal>;
      despesa: Record<string, CustomGoal>;
      matriculas?: CustomGoal;
      horaAluno?: CustomGoal;
      modalidades?: Record<string, { metaMat: number, metaHa: number }>;
    };
    qualidade: {
      evasao?: CustomGoal;
      modalidades?: Record<string, { metaEvasao: number }>;
    };
    crescimento: {
      produtos: Record<string, CustomGoal>;
    };
  }>;
  goalsUpdatedAt?: string | null;
}
