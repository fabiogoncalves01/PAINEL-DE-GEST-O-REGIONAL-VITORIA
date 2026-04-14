/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, ChangeEvent, Fragment, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Bell, 
  LayoutDashboard, 
  FileText, 
  Settings, 
  ChevronRight, 
  ChevronDown,
  Calendar, 
  TrendingUp, 
  ShieldCheck,
  School, 
  History, 
  Download, 
  Upload,
  Headphones, 
  LogOut,
  ArrowLeft,
  Info,
  AlertTriangle,
  CheckCircle2,
  Users,
  Clock,
  Building2,
  MoreVertical,
  FileSpreadsheet,
  BarChart3,
  Menu,
  Trash2
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { UNIDADES, NOMES_MESES, MESES_TRIMESTRE } from './constants';
import { Unit, AppState, MonthData, PillarData, ImportedBusinessUnit, ImportedCostCenter, ImportedBreakdown } from './types';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { CurrencyInput } from './components/CurrencyInput';

// --- Utility Functions ---

const getCombinedList = (predefined: any[], unitGoals: any, pilar: string, type: string) => {
  const customMap = unitGoals?.[pilar]?.[type] || {};
  const list = [...predefined];
  const predefinedNames = new Set(predefined.map(p => p.nome));
  
  Object.keys(customMap).forEach(name => {
    if (!predefinedNames.has(name) && !customMap[name].deleted) {
      list.push({ nome: name, metaMes: customMap[name].metaMes || 0, metaEvasao: customMap[name].metaMes || 5.0 });
    }
  });
  
  return list.filter(item => !customMap[item.nome]?.deleted);
};

const getEffectiveMeta = (unitId: string, pilarKey: string, mes: number, customGoals: any, indicator?: string) => {
  const unit = UNIDADES[unitId];
  if (!unit) return 0;
  const pilar = unit.pilares[pilarKey as keyof typeof unit.pilares];
  const dataMes = pilar.meses[mes];
  
  const unitGoals = customGoals[unitId] || {};

  if (pilarKey === 'eficiencia') {
    const efGoals = unitGoals.eficiencia || { receita: {}, despesa: {} };
    
    if (indicator === 'matriculas') {
      const g = efGoals.matriculas?._root;
      return (g && g.metasMensais && g.metasMensais[mes] !== undefined) ? g.metasMensais[mes] : (g ? g.metaMes : dataMes.metaMatMes);
    }
    if (indicator === 'horaAluno') {
      const g = efGoals.horaAluno?._root;
      return (g && g.metasMensais && g.metasMensais[mes] !== undefined) ? g.metasMensais[mes] : (g ? g.metaMes : dataMes.metaHaMes);
    }

    const predefinedRevenue = pilar.centrosCusto?.receita || [];
    const combinedRevenue = getCombinedList(predefinedRevenue, unitGoals, 'eficiencia', 'receita');
    
    let totalMeta = 0;
    
    combinedRevenue.forEach(ecc => {
      const customGoal = efGoals.receita?.[ecc.nome];
      if (customGoal) {
        const metaMesCC = (customGoal.metasMensais && customGoal.metasMensais[mes] !== undefined) 
          ? customGoal.metasMensais[mes] 
          : customGoal.metaMes;
        totalMeta += metaMesCC;
      } else {
        totalMeta += ecc.metaMes;
      }
    });
    
    return totalMeta;
  }

  if (pilarKey === 'qualidade' && indicator === 'evasao') {
    const qGoals = unitGoals.qualidade || {};
    const evasaoGoals = qGoals.evasao || {};
    const predefinedModalidades = pilar.modalidades || [{ nome: 'Evasão de Matrícula', metaEvasao: 5.0 }];
    const combinedModalidades = getCombinedList(predefinedModalidades, unitGoals, 'qualidade', 'evasao');
    
    let totalMeta = 0;
    let count = 0;
    
    combinedModalidades.forEach(m => {
      const g = evasaoGoals[m.nome];
      if (g) {
        totalMeta += (g.metasMensais && g.metasMensais[mes] !== undefined) ? g.metasMensais[mes] : g.metaMes;
      } else {
        totalMeta += (m.metaEvasao || 5.0);
      }
      count++;
    });
    
    return count > 0 ? totalMeta / count : dataMes.metaEvasaoMes;
  }

  if (pilarKey === 'crescimento') {
    const cGoals = unitGoals.crescimento || { produtos: {} };
    const predefinedProducts = pilar.produtos || [];
    const combinedProducts = getCombinedList(predefinedProducts, unitGoals, 'crescimento', 'produtos');
    
    let totalMeta = 0;

    combinedProducts.forEach(p => {
      const customGoal = cGoals.produtos?.[p.nome];
      if (customGoal) {
        const metaM = (customGoal.metasMensais && customGoal.metasMensais[mes] !== undefined)
          ? customGoal.metasMensais[mes]
          : customGoal.metaMes;
        totalMeta += metaM;
      } else {
        totalMeta += p.metaMes;
      }
    });
    return totalMeta;
  }
  
  return dataMes.metaMes;
};

const formatBRL = (valor: number) => {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatNum = (valor: number) => {
  return valor.toLocaleString('pt-BR');
};

const calcPercent = (realizado: number, meta: number): string => {
  if (!meta || meta === 0) return '0';
  return ((realizado / meta) * 100).toFixed(1);
};

const getSemaforoClass = (percent: string | number) => {
  const p = parseFloat(String(percent));
  if (p >= 96) return 'text-ok';
  if (p >= 71) return 'text-atencao';
  return 'text-critico';
};

const getSemaforoBgClass = (percent: string | number) => {
  const p = parseFloat(String(percent));
  if (p >= 96) return 'bg-ok';
  if (p >= 71) return 'bg-atencao';
  return 'bg-critico';
};

const getLabelStatus = (percent: string | number) => {
  const p = parseFloat(String(percent));
  if (p >= 100) return 'Meta Atingida';
  if (p >= 70) return 'Atenção';
  return 'Crítico';
};

const calcularTrimestre = (mes: number): 1 | 2 | 3 | 4 => {
  if (mes <= 2) return 1;
  if (mes <= 5) return 2;
  if (mes <= 8) return 3;
  return 4;
};

// Semáforo invertido — usado exclusivamente no pilar Qualidade (evasão)
const semaforoEvasao = (metaPermitida: number, realizado: number) => {
  if (realizado <= metaPermitida) return 'status-ok';         // verde
  if (realizado <= metaPermitida * 1.3) return 'status-atencao'; // amarelo
  return 'status-critico';                                     // vermelho
};

const semaforoEvasaoBg = (metaPermitida: number, realizado: number) => {
  if (realizado <= metaPermitida) return 'bg-ok';
  if (realizado <= metaPermitida * 1.3) return 'bg-atencao';
  return 'bg-critico';
};

const labelStatusEvasao = (metaPermitida: number, realizado: number) => {
  if (realizado <= metaPermitida) return 'Controlado';
  if (realizado <= metaPermitida * 1.3) return 'Atenção';
  return 'Crítico';
};

// --- Constants ---

const INITIAL_CUSTOM_GOALS: any = {
  senai_bm: {
    eficiencia: {
      receita: {
        'Técnico de Nível Médio Presencial': {
          metaMes: 44456,
          metaAnual: 489016,
          metasMensais: [0, 44456, 44456, 44456, 44456, 44456, 44456, 44456, 44456, 44456, 44456, 44456]
        },
        'Técnico de Nível Médio à Distância': {
          metaMes: 12702,
          metaAnual: 139722,
          metasMensais: [0, 12702, 12702, 12702, 12702, 12702, 12702, 12702, 12702, 12702, 12702, 12702]
        },
        'Qualificação Profissional Presencial': {
          metaMes: 14313,
          metaAnual: 85878,
          metasMensais: [0, 14313, 14313, 14313, 0, 0, 0, 0, 14313, 14313, 14313, 0]
        },
        'Aperfeiçoamento Presencial': {
          metaMes: 9454,
          metaAnual: 101566,
          metasMensais: [0, 0, 9454, 15299, 9602, 19203, 22334, 0, 9601, 9602, 6471, 0]
        }
      },
      despesa: {},
      matriculas: { metaMes: 300, metaAnual: 3600 },
      horaAluno: { metaMes: 10000, metaAnual: 120000 }
    },
    qualidade: {
      evasao: {
        'Evasão de Matrícula': { metaMes: 5, metaAnual: 5 }
      }
    },
    crescimento: {
      produtos: {}
    }
  }
};

// --- Components ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [state, setState] = useState<AppState>({
    telaAtiva: 1,
    unidadeSelecionada: null,
    pilarSelecionado: null,
    mesAtual: new Date().getMonth(),
    mesFim: new Date().getMonth(),
    filtroModo: 'mes',
    anoAtual: new Date().getFullYear(),
    trimestreAtivo: calcularTrimestre(new Date().getMonth()),
    importedData: {},
    importHistory: [],
    customGoals: INITIAL_CUSTOM_GOALS,
  });

  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' | 'info', visible: boolean }>({ message: '', type: 'info', visible: false });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubGoals = onSnapshot(doc(db, 'appData', 'customGoals'), (doc) => {
      if (doc.exists()) {
        try {
          const data = JSON.parse(doc.data().goals);
          const updatedAt = doc.data().updatedAt;
          setState(prev => ({ ...prev, customGoals: data, goalsUpdatedAt: updatedAt }));
        } catch (e) {
          console.error("Error parsing custom goals:", e);
        }
      }
    });

    const unsubImported = onSnapshot(doc(db, 'appData', 'importedData'), (doc) => {
      if (doc.exists()) {
        try {
          const data = JSON.parse(doc.data().data);
          const history = doc.data().history ? JSON.parse(doc.data().history) : [];
          const updatedAt = doc.data().updatedAt;
          setState(prev => ({ ...prev, importedData: data, importHistory: history, importedDataUpdatedAt: updatedAt }));
        } catch (e) {
          console.error("Error parsing imported data:", e);
        }
      }
    });

    return () => {
      unsubGoals();
      unsubImported();
    };
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
      showToast("Erro ao fazer login", "error");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // We no longer clear data on logout since it's global
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const saveGoalsToFirebase = async (goals: any) => {
    if (!user) {
      showToast("Você precisa fazer login para salvar metas.", "error");
      return;
    }
    try {
      await setDoc(doc(db, 'appData', 'customGoals'), {
        goals: JSON.stringify(goals),
        updatedAt: new Date().toISOString(),
        updatedBy: user.email || 'Usuário Desconhecido'
      });
      showToast("Metas salvas com sucesso!", "success");
    } catch (error) {
      console.error("Error saving goals:", error);
      showToast("Erro ao salvar metas", "error");
    }
  };

  const saveImportedDataToFirebase = async (data: any, history: any[]) => {
    if (!user) {
      showToast("Você precisa fazer login para importar dados.", "error");
      return;
    }
    try {
      await setDoc(doc(db, 'appData', 'importedData'), {
        data: JSON.stringify(data),
        history: JSON.stringify(history),
        updatedAt: new Date().toISOString(),
        updatedBy: user.email || 'Usuário Desconhecido'
      });
    } catch (error) {
      console.error("Error saving imported data:", error);
      showToast("Erro ao salvar dados importados", "error");
    }
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type, visible: true });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 3000);
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    if (!user) {
      showToast("Você precisa fazer login para importar dados.", "error");
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const newImportedData: Record<string, Record<number, ImportedBusinessUnit>> = {};

        data.forEach((row) => {
        // A. Detecção de Mês
        let rowMonth = state.mesAtual; // Fallback para o mês selecionado se não encontrar na linha
        const keys = Object.keys(row);
        const findKey = (targets: string[]) => {
          // Prioridade 1: Match exato (case insensitive)
          const exact = keys.find(k => targets.some(t => k.toLowerCase() === t.toLowerCase()));
          if (exact) return exact;
          // Prioridade 2: Match parcial
          return keys.find(k => targets.some(t => k.toLowerCase().includes(t.toLowerCase())));
        };
        
        const dateKey = findKey(['datalancamento', 'vencimento', 'data', 'emissão', 'referência']);
        const dateVal = dateKey ? row[dateKey] : null;
        
        if (dateVal) {
          if (typeof dateVal === 'number') {
            // XLSX serial date (Excel base date is Dec 30, 1899)
            const date = new Date(Math.round((dateVal - 25569) * 86400 * 1000));
            if (!isNaN(date.getTime())) rowMonth = date.getUTCMonth();
          } else if (typeof dateVal === 'string') {
            // Tenta parsear string DD/MM/YYYY ou YYYY-MM-DD
            const parts = dateVal.split(/[/ -]/);
            if (parts.length >= 2) {
              const m = parseInt(parts[1]);
              if (m >= 1 && m <= 12) rowMonth = m - 1;
            }
          }
        }

        const idGrupoKey = findKey(['idgrupocontabil', 'id_grupo_contabil', 'cod_conta', 'idconta', 'conta']);
        const idGrupo = String((idGrupoKey ? row[idGrupoKey] : '') || '');

        const nmGrupoContabilKey = findKey(['nmgrupocontabil', 'nm_grupo_contabil', 'grupocontabil']);
        const nmGrupoContabil = String((nmGrupoContabilKey ? row[nmGrupoContabilKey] : '') || '').toLowerCase();

        const nmContaContabilKey = findKey(['nmcontacontabil', 'nm_conta_contabil', 'conta_contabil']);
        const nmContaContabil = String((nmContaContabilKey ? row[nmContaContabilKey] : '') || '').toLowerCase();
        
        const tipoRowKey = findKey(['despesareceita', 'receita/despesa', 'tipo', 'natureza', 'tp_natureza', 'origem']);
        const tipoRow = String((tipoRowKey ? row[tipoRowKey] : '') || '').toLowerCase();
        
        // Classificação de Receita e Despesa
        let isReceita = nmGrupoContabil.includes('receitas de serviço') && 
                        nmContaContabil.includes('serviços educacionais');

        let isDespesa = idGrupo.startsWith('3') || 
                        idGrupo.startsWith('5') || 
                        nmGrupoContabil.includes('despesa') || 
                        nmGrupoContabil.includes('custo') || 
                        nmContaContabil.includes('despesa') ||
                        nmContaContabil.includes('custo') ||
                        nmGrupoContabil.includes('encargo') ||
                        nmGrupoContabil.includes('imposto') ||
                        nmGrupoContabil.includes('tributo') ||
                        nmGrupoContabil.includes('pessoal') ||
                        nmGrupoContabil.includes('material') ||
                        nmGrupoContabil.includes('manutenção') ||
                        tipoRow.includes('despesa') || 
                        tipoRow.includes('custo') || 
                        tipoRow === 'd';
        
        // Priorização em caso de conflito
        if (isReceita && isDespesa) {
          if (idGrupo.startsWith('4')) isDespesa = false;
          else if (idGrupo.startsWith('3') || idGrupo.startsWith('5')) isReceita = false;
        }

        if (!isReceita && !isDespesa) return;

        // B. Mapeamento de Colunas (Busca mais flexível)
        let costCenterName = row['NMItemContabil'] || row['NMCentroCusto'] || row[findKey(['item contabil', 'centro de custo']) || ''] || 'Sem Centro de Custo';
        let unitName = row['Unidade'] || row['Estabelecimento'] || row['NMCentroCustoSu'] || row['NMCentroCustoSup'] || row[findKey(['unidade', 'estabelecimento', 'centro de custo sup']) || ''] || 'Sem Unidade';
        let valorRaw = row['Valor Realizado'] || row['VlRealizado'] || row['Valor'] || row['VlLiquido'] || row[findKey(['valor', 'vl realizado', 'vl liquido', 'total']) || ''] || 0;
        let documento = String(row['CPFCNPJ'] || row['CNPJCPF'] || row['CNPJ/CPF'] || row['CNPJ'] || row['CPF'] || row[findKey(['cpf', 'cnpj', 'documento', 'idpessoa']) || ''] || '');
        let cliente = row['FORNECEDOR'] || row['CLIENTE'] || row['NMFantasia'] || row['NMPessoa'] || row[findKey(['fornecedor', 'cliente', 'fantasia', 'pessoa', 'nome']) || ''] || 'Cliente Desconhecido';

        // C. Normalização de Nomes
        const unitNameLower = unitName.toLowerCase();
        if (
          unitNameLower.includes('vitoria educação') || 
          unitNameLower.includes('vitória educação') || 
          unitNameLower.includes('senai vitória') || 
          unitNameLower.includes('senai vitoria') ||
          unitNameLower.includes('beira mar') ||
          unitNameLower.includes('beiramar')
        ) {
          unitName = 'Beira Mar';
        } else if (unitNameLower.includes('porto')) {
          unitName = 'Porto';
        } else if (unitNameLower.includes('jardim da penha') || unitNameLower.includes('jardim penha')) {
          unitName = 'Jardim da Penha';
        } else if (unitNameLower.includes('maruípe') || unitNameLower.includes('maruipe')) {
          unitName = 'Maruípe';
        }

        // D. Tratamento de Valores Financeiros
        const parseFinancialValue = (val: any): number => {
          if (typeof val === 'number') return val;
          if (!val || typeof val !== 'string') return 0;
          
          let str = val.trim();
          const isNegative = str.includes('-') || (str.startsWith('(') && str.endsWith(')'));
          
          // Remove currency symbols and other non-numeric chars except , . and -
          str = str.replace(/[^\d,.-]/g, '');
          
          // Determine decimal separator
          const lastComma = str.lastIndexOf(',');
          const lastDot = str.lastIndexOf('.');
          
          if (lastComma > lastDot) {
            // Brazilian format: 1.234,56
            str = str.replace(/\./g, '').replace(',', '.');
          } else if (lastDot > lastComma) {
            // English format: 1,234.56
            str = str.replace(/,/g, '');
          } else if (lastComma !== -1) {
            // Only comma: 1234,56
            str = str.replace(',', '.');
          }
          
          let num = parseFloat(str);
          if (isNaN(num)) return 0;
          return isNegative ? -Math.abs(num) : num;
        };
        
        let valor = parseFinancialValue(valorRaw);
        if (isNaN(valor)) valor = 0;

        // E. Classificação PJ vs PF
        const docDigits = documento.replace(/\D/g, '');
        const isPJ = docDigits.length > 11;

        // F. Criação Dinâmica e Agregação
        // Tenta encontrar a unidade correspondente no sistema de forma mais flexível
        const matchingUnit = Object.values(UNIDADES).find(u => {
          const uNome = u.nome.toLowerCase();
          const uId = u.id.toLowerCase();
          const search = unitName.toLowerCase();
          return uNome === search || 
                 uId === search ||
                 uNome.includes(search) ||
                 search.includes(uNome) ||
                 (search === 'beira mar' && uNome.includes('beira mar'));
        });
        
        const buKey = matchingUnit ? matchingUnit.id : unitName.toLowerCase();
        
        // Se não encontrou unidade correspondente, ignora a linha para evitar "Sem Unidade"
        if (!matchingUnit) return;
        
        if (!newImportedData[buKey]) {
          newImportedData[buKey] = {};
        }

        if (!newImportedData[buKey][rowMonth]) {
          newImportedData[buKey][rowMonth] = {
            id: buKey,
            name: matchingUnit ? matchingUnit.nome : unitName,
            costCenters: [],
            revenue: { total: 0, pj: 0, pf: 0 },
            expense: { total: 0, pj: 0, pf: 0 }
          };
        }

        const bu = newImportedData[buKey][rowMonth];
        let cc = bu.costCenters.find(c => c.name.toLowerCase() === costCenterName.toLowerCase());
        if (!cc) {
          cc = {
            id: costCenterName.toLowerCase().replace(/\s+/g, '-'),
            name: costCenterName,
            revenue: { total: 0, pj: 0, pf: 0 },
            expense: { total: 0, pj: 0, pf: 0 },
            revenueCompanies: [],
            expenseCompanies: [],
            accountingGroups: []
          };
          bu.costCenters.push(cc);
        }

        if (isReceita) {
          cc.revenue.total += valor;
          bu.revenue.total += valor;

          if (isPJ) {
            cc.revenue.pj += valor;
            bu.revenue.pj += valor;
            
            let company = cc.revenueCompanies.find(comp => comp.name === cliente);
            if (company) {
              company.value += valor;
            } else {
              cc.revenueCompanies.push({ name: cliente, value: valor });
            }
          } else {
            cc.revenue.pf += valor;
            bu.revenue.pf += valor;
          }
        } else if (isDespesa) {
          cc.expense.total += valor;
          bu.expense.total += valor;

          // Detalhamento por Grupo Contábil (Sempre detalha despesa por grupo)
          const groupName = String(nmGrupoContabilKey ? row[nmGrupoContabilKey] : 'Outros').toUpperCase();
          let group = cc.accountingGroups.find(g => g.name === groupName);
          if (group) {
            group.value += valor;
          } else {
            cc.accountingGroups.push({ name: groupName, value: valor });
          }

          if (isPJ) {
            cc.expense.pj += valor;
            bu.expense.pj += valor;
            
            // Adiciona também detalhamento de empresas para despesas (fornecedores)
            let company = cc.expenseCompanies.find(comp => comp.name === cliente);
            if (company) {
              company.value += valor;
            } else {
              cc.expenseCompanies.push({ name: cliente, value: valor });
            }
          } else {
            cc.expense.pf += valor;
            bu.expense.pf += valor;
          }
        }
      });

        setState(prev => {
          const newHistoryEntry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            userEmail: user?.email || 'Usuário Desconhecido',
            fileName: file.name,
            data: prev.importedData
          };
          
          // Keep only last 5 history entries to avoid hitting Firestore limits
          const newHistory = [newHistoryEntry, ...prev.importHistory].slice(0, 5);
          
          const newState = { 
            ...prev, 
            importedData: newImportedData,
            importHistory: newHistory
          };
          
          if (user) {
            saveImportedDataToFirebase(newImportedData, newHistory);
          }
          return newState;
        });
        showToast('Planilha importada com sucesso!', 'success');
      } catch (error) {
        console.error("Erro ao importar planilha:", error);
        showToast('Erro ao importar a planilha. Verifique o formato.', 'error');
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const [searchTerm, setSearchTerm] = useState('');

  // Update month when trimester changes
  const handleSelectTrimestre = (t: 1 | 2 | 3 | 4) => {
    const mesesDoTrim = MESES_TRIMESTRE[t];
    setState(prev => ({ 
      ...prev, 
      trimestreAtivo: t, 
      mesAtual: mesesDoTrim[0], 
      mesFim: mesesDoTrim[mesesDoTrim.length - 1],
      filtroModo: 'trimestre'
    }));
  };

  const handleSelectMes = (m: number) => {
    const novoTrim = calcularTrimestre(m);
    setState(prev => ({ 
      ...prev, 
      mesAtual: m, 
      mesFim: m, 
      trimestreAtivo: novoTrim,
      filtroModo: 'mes'
    }));
  };

  const handleSelectRange = (inicio: number, fim: number) => {
    const novoTrim = calcularTrimestre(inicio);
    setState(prev => ({
      ...prev,
      mesAtual: inicio,
      mesFim: fim,
      filtroModo: 'periodo',
      trimestreAtivo: novoTrim
    }));
  };

  const irParaTela = (numero: 1 | 2 | 3 | 4 | 5 | 6) => {
    setState(prev => ({ ...prev, telaAtiva: numero }));
  };

  const selecionarUnidade = (id: string) => {
    setState(prev => ({ ...prev, unidadeSelecionada: id, telaAtiva: 2 }));
  };

  const selecionarPilar = (pilar: 'eficiencia' | 'qualidade' | 'crescimento') => {
    setState(prev => ({ ...prev, pilarSelecionado: pilar, telaAtiva: 3 }));
  };

  const voltar = () => {
    if (state.telaAtiva === 3) irParaTela(2);
    else if (state.telaAtiva === 2) irParaTela(1);
  };

  const currentUnit = state.unidadeSelecionada ? UNIDADES[state.unidadeSelecionada] : null;

  const handleExport = () => {
    const dataToExport = {
      unidade: currentUnit?.nome || 'Regional Vitória',
      periodo: `${NOMES_MESES[state.mesAtual]} / ${state.anoAtual}`,
      trimestre: `T${state.trimestreAtivo}`,
      dados: currentUnit ? {
        eficiencia: currentUnit.pilares.eficiencia.meses[state.mesAtual],
        qualidade: currentUnit.pilares.qualidade.meses[state.mesAtual],
        crescimento: currentUnit.pilares.crescimento.meses[state.mesAtual]
      } : UNIDADES
    };

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `exportacao_${currentUnit?.tag || 'regional'}_${NOMES_MESES[state.mesAtual].toLowerCase()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Dados exportados com sucesso!', 'success');
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 bg-white/60 backdrop-blur-xl border-b border-white/20 flex items-center justify-between px-8 py-3">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 text-texto-muted hover:text-azul hover:bg-white/40 rounded-xl transition-colors"
          >
            <Menu size={20} />
          </button>
          <span className="text-xl font-black text-azul font-headline tracking-tight">SESI/SENAI Regional</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-white/50 rounded-full px-4 py-1.5 flex items-center gap-2 border border-white/30 hidden md:flex">
            <Search className="text-texto-muted w-4 h-4" />
            <input 
              type="text" 
              placeholder="Buscar unidade..." 
              className="bg-transparent border-none focus:ring-0 text-sm text-texto w-40 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className="text-texto-muted hover:text-azul transition-colors p-2 rounded-full hover:bg-white/40">
            <Bell className="w-5 h-5" />
          </button>
          <div className="h-8 w-8 rounded-full overflow-hidden border border-azul/10">
            <img 
              src={user?.photoURL || "https://picsum.photos/seed/user/100/100"} 
              alt="User" 
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </header>

      <div className="flex flex-1 pt-14">
        {/* Sidebar */}
        <aside className={`fixed left-0 top-14 h-[calc(100vh-3.5rem)] z-40 bg-white/40 backdrop-blur-xl border-r border-white/20 flex flex-col py-6 transition-all duration-300 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
          <div className={`px-6 mb-8 flex items-center gap-3 ${!isSidebarOpen && 'justify-center px-0'}`}>
            <div className="w-10 h-10 bg-azul rounded-xl flex items-center justify-center text-white shadow-lg shadow-azul/20 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            {isSidebarOpen && (
              <div className="overflow-hidden">
                <h2 className="text-lg font-bold text-azul font-headline truncate">Vitória</h2>
                <p className="text-xs text-texto-muted font-semibold tracking-widest uppercase truncate">Regional ES</p>
              </div>
            )}
          </div>

          <nav className="flex-1 px-4 space-y-8 overflow-y-auto overflow-x-hidden scrollbar-hide">
            {/* Global Navigation */}
            <div className="space-y-1">
              {isSidebarOpen && <p className="px-4 text-xs font-black text-texto-muted uppercase tracking-widest mb-2">Regional</p>}
              <SidebarItem 
                icon={<LayoutDashboard size={18} />} 
                label="Visão Geral" 
                active={state.telaAtiva === 1} 
                onClick={() => irParaTela(1)} 
                collapsed={!isSidebarOpen}
              />
              <SidebarItem 
                icon={<Building2 size={18} />} 
                label="Todas as Unidades" 
                active={state.telaAtiva === 1} 
                onClick={() => irParaTela(1)} 
                collapsed={!isSidebarOpen}
              />
              <SidebarItem 
                icon={<FileSpreadsheet size={18} />} 
                label="Importar Dados" 
                active={state.telaAtiva === 4} 
                onClick={() => irParaTela(4)} 
                collapsed={!isSidebarOpen}
              />
              <SidebarItem 
                icon={<Settings size={18} />} 
                label="Configurar Metas" 
                active={state.telaAtiva === 5} 
                onClick={() => irParaTela(5)} 
                collapsed={!isSidebarOpen}
              />
              <SidebarItem 
                icon={<History size={18} />} 
                label="Histórico Regional" 
                active={state.telaAtiva === 6}
                onClick={() => irParaTela(6)}
                collapsed={!isSidebarOpen}
              />
            </div>

            {/* Contextual Unit Navigation */}
            {currentUnit && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="space-y-1"
              >
                {isSidebarOpen && <p className="px-4 text-xs font-black text-texto-muted uppercase tracking-widest mb-2">Unidade Ativa</p>}
                {isSidebarOpen ? (
                  <div className="px-4 py-3 mb-2 bg-azul/5 rounded-xl border border-azul/10">
                    <p className="text-xs font-bold text-azul truncate">{currentUnit.nome}</p>
                    <p className="text-xs text-texto-muted font-medium">{currentUnit.tag}</p>
                  </div>
                ) : (
                  <div className="flex justify-center mb-2">
                    <div className="w-10 h-10 bg-azul/10 rounded-xl flex items-center justify-center text-azul font-bold text-xs" title={currentUnit.nome}>
                      {currentUnit.nome.substring(0, 2)}
                    </div>
                  </div>
                )}
                <SidebarItem 
                  icon={<School size={18} />} 
                  label="Resumo Unidade" 
                  active={state.telaAtiva === 2} 
                  onClick={() => irParaTela(2)} 
                  collapsed={!isSidebarOpen}
                />
                {isSidebarOpen && (
                  <div className="pl-4 space-y-1 border-l-2 border-azul/10 ml-6 mt-1">
                    <SidebarSubItem 
                      label="Eficiência" 
                      active={state.telaAtiva === 3 && state.pilarSelecionado === 'eficiencia'} 
                      onClick={() => selecionarPilar('eficiencia')} 
                    />
                    <SidebarSubItem 
                      label="Qualidade" 
                      active={state.telaAtiva === 3 && state.pilarSelecionado === 'qualidade'} 
                      onClick={() => selecionarPilar('qualidade')} 
                    />
                    <SidebarSubItem 
                      label="Crescimento" 
                      active={state.telaAtiva === 3 && state.pilarSelecionado === 'crescimento'} 
                      onClick={() => selecionarPilar('crescimento')} 
                    />
                  </div>
                )}
              </motion.div>
            )}
          </nav>

          <div className="px-4 mt-auto space-y-4">
            <button 
              onClick={() => irParaTela(4)}
              className="w-full bg-verde text-white py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-verde/20 flex items-center justify-center gap-2 hover:bg-verde-dark transition-all active:scale-95"
            >
              <FileSpreadsheet size={16} />
              <span>Importar Excel</span>
            </button>
            <button 
              onClick={handleExport}
              className="w-full bg-azul text-white py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-azul/20 flex items-center justify-center gap-2 hover:bg-azul-dark transition-all active:scale-95"
            >
              <Download size={16} />
              <span>Exportar Dados</span>
            </button>
            <div className="pt-4 border-t border-white/30">
              <button className="flex items-center gap-3 px-4 py-2 text-texto-muted hover:text-azul transition-colors text-sm font-medium w-full">
                <Headphones size={18} />
                <span>Suporte</span>
              </button>
              {user ? (
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-4 py-2 text-critico hover:opacity-80 transition-opacity text-sm font-medium w-full"
                >
                  <LogOut size={18} />
                  <span>Sair ({user.email?.split('@')[0]})</span>
                </button>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-3 px-4 py-2 text-verde hover:opacity-80 transition-opacity text-sm font-medium w-full"
                >
                  <LogOut size={18} className="rotate-180" />
                  <span>Fazer Login</span>
                </button>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className={`flex-1 transition-all duration-300 ${isSidebarOpen ? 'ml-64' : 'ml-20'} p-8 bg-fundo/30`}>
          <AnimatePresence mode="wait">
            {state.telaAtiva === 1 && (
              <motion.div 
                key="tela1"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-7xl mx-auto"
              >
                <div className="flex justify-between items-end mb-10">
                  <div>
                    <h1 className="text-3xl font-headline font-extrabold tracking-tight text-azul">
                      ACOMPANHAMENTO DE INDICADORES REGIONAL VITÓRIA
                    </h1>
                    <p className="text-texto-muted font-medium mt-1">Visão Geral das Unidades SESI e SENAI</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <MonthSelector 
                      activeMes={state.mesAtual} 
                      mesFim={state.mesFim}
                      filtroModo={state.filtroModo}
                      onSelect={handleSelectMes} 
                      onSelectRange={handleSelectRange}
                    />
                    <TrimestreSelector activeTrim={state.trimestreAtivo} onSelect={handleSelectTrimestre} />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {Object.values(UNIDADES)
                    .filter(u => u.nome.toLowerCase().includes(searchTerm.toLowerCase()))
                    .map(unit => (
                    <UnitCard 
                      key={unit.id} 
                      unit={unit} 
                      mesInicio={state.mesAtual} 
                      mesFim={state.mesFim}
                      onClick={() => selecionarUnidade(unit.id)} 
                      customGoals={state.customGoals}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {state.telaAtiva === 2 && currentUnit && (
              <motion.div 
                key="tela2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-7xl mx-auto"
              >
                <div className="mb-8">
                  <button onClick={voltar} className="flex items-center gap-2 text-sm text-texto-muted hover:text-azul transition-colors mb-4">
                    <ArrowLeft size={16} />
                    <span>Voltar para Seleção</span>
                  </button>
                  <div className="flex justify-between items-end">
                    <div>
                      <h1 className="text-4xl font-headline font-extrabold tracking-tight text-azul">{currentUnit.nome}</h1>
                      <p className="text-texto-muted font-medium mt-1">{currentUnit.tag} — Regional ES</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <MonthSelector 
                        activeMes={state.mesAtual} 
                        mesFim={state.mesFim}
                        filtroModo={state.filtroModo}
                        onSelect={handleSelectMes} 
                        onSelectRange={handleSelectRange}
                      />
                      <TrimestreSelector activeTrim={state.trimestreAtivo} onSelect={handleSelectTrimestre} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
                  <PillarCard 
                    pilar={currentUnit.pilares.eficiencia} 
                    unitId={currentUnit.id}
                    pilarKey="eficiencia"
                    mesInicio={state.mesAtual} 
                    mesFim={state.mesFim}
                    trim={state.trimestreAtivo}
                    type="financeiro"
                    onClick={() => selecionarPilar('eficiencia')}
                    tema={currentUnit.tema}
                    customGoals={state.customGoals}
                  />
                  <PillarCard 
                    pilar={currentUnit.pilares.qualidade} 
                    unitId={currentUnit.id}
                    pilarKey="qualidade"
                    mesInicio={state.mesAtual} 
                    mesFim={state.mesFim}
                    trim={state.trimestreAtivo}
                    type="producao"
                    onClick={() => selecionarPilar('qualidade')}
                    tema={currentUnit.tema}
                    customGoals={state.customGoals}
                  />
                  <PillarCard 
                    pilar={currentUnit.pilares.crescimento} 
                    unitId={currentUnit.id}
                    pilarKey="crescimento"
                    mesInicio={state.mesAtual} 
                    mesFim={state.mesFim}
                    trim={state.trimestreAtivo}
                    type="crescimento"
                    onClick={() => selecionarPilar('crescimento')}
                    tema={currentUnit.tema}
                    customGoals={state.customGoals}
                  />
                </div>
              </motion.div>
            )}

            {state.telaAtiva === 3 && currentUnit && state.pilarSelecionado && (
              <motion.div 
                key="tela3"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="max-w-7xl mx-auto"
              >
                <div className="mb-8">
                  <button onClick={voltar} className="flex items-center gap-2 text-sm text-texto-muted hover:text-azul transition-colors mb-4">
                    <ArrowLeft size={16} />
                    <span>Voltar para Unidade</span>
                  </button>
                  <div className="flex justify-between items-end">
                    <div>
                      <h1 className="text-4xl font-headline font-extrabold tracking-tight text-azul">
                        Pilar {currentUnit.pilares[state.pilarSelecionado].titulo}
                      </h1>
                      <p className="text-texto-muted font-medium mt-1">{currentUnit.nome} — {currentUnit.pilares[state.pilarSelecionado].subtitulo}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <MonthSelector 
                        activeMes={state.mesAtual} 
                        mesFim={state.mesFim}
                        filtroModo={state.filtroModo}
                        onSelect={handleSelectMes} 
                        onSelectRange={handleSelectRange}
                      />
                      <TrimestreSelector activeTrim={state.trimestreAtivo} onSelect={handleSelectTrimestre} />
                    </div>
                  </div>
                </div>

                <DetailView 
                  unit={currentUnit} 
                  pilarKey={state.pilarSelecionado} 
                  mesInicio={state.mesAtual} 
                  mesFim={state.mesFim}
                  filtroModo={state.filtroModo}
                  trim={state.trimestreAtivo} 
                  importedDataRecord={state.importedData}
                  customGoals={state.customGoals}
                />
              </motion.div>
            )}
            {state.telaAtiva === 4 && (
              <motion.div 
                key="tela4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-4xl mx-auto"
              >
                <div className="mb-10">
                  <h1 className="text-3xl font-headline font-extrabold tracking-tight text-azul">
                    Central de Importação de Dados
                  </h1>
                  <p className="text-texto-muted font-medium mt-1">Suba os arquivos de faturamento contábil por unidade</p>
                </div>

                <div className="grid grid-cols-1 gap-8">
                  <div className="glass-panel p-8 rounded-3xl border-2 border-dashed border-azul/20 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-azul/5 rounded-2xl flex items-center justify-center text-azul mb-4">
                      <Upload size={32} />
                    </div>
                    <h3 className="text-xl font-bold text-azul mb-2">Upload de Planilha</h3>
                    <p className="text-sm text-texto-muted mb-6 max-w-md">
                      Selecione o arquivo Excel da unidade. O sistema identificará automaticamente a unidade e processará receitas e despesas.
                    </p>
                    <div className="relative">
                      <input 
                        type="file" 
                        accept=".xlsx, .xls" 
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        disabled={isLoading}
                      />
                      <button 
                        className={`bg-azul text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-azul/20 transition-all flex items-center justify-center gap-2 ${isLoading ? 'opacity-70 cursor-not-allowed' : 'hover:bg-azul-dark'}`}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Processando...
                          </>
                        ) : (
                          'Selecionar Arquivo'
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-bold text-azul flex items-center gap-2">
                      <CheckCircle2 size={20} className="text-verde" />
                      Unidades com Dados Importados
                    </h3>
                    {Object.keys(state.importedData).length === 0 ? (
                      <div className="glass-panel p-6 rounded-2xl text-center text-texto-muted italic text-sm">
                        Nenhum dado importado ainda.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {Object.entries(state.importedData).map(([unitId, months]) => {
                          const bu = months[state.mesAtual] || Object.values(months)[0]; // Mostra o mês atual ou o primeiro disponível
                          if (!bu) return null;
                          return (
                            <div key={unitId} className="glass-panel p-4 rounded-xl flex justify-between items-center">
                              <div>
                                <p className="font-bold text-azul">{bu.name}</p>
                                <p className="text-xs text-texto-muted uppercase font-black">{bu.costCenters.length} Centros de Custo</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-bold text-verde">Rec: {formatBRL(bu.revenue.total)}</p>
                                <p className="text-xs font-bold text-critico">Desp: {formatBRL(bu.expense.total)}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Visualização de Dados Importados (Se houver para a unidade selecionada) */}
                {currentUnit && state.importedData[currentUnit.id] && state.importedData[currentUnit.id][state.mesAtual] && (
                  <ImportedDataView data={state.importedData[currentUnit.id][state.mesAtual]} />
                )}
              </motion.div>
            )}

            {state.telaAtiva === 5 && (
              <motion.div 
                key="tela5"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-6xl mx-auto"
              >
                <GoalsScreen 
                  customGoals={state.customGoals}
                  user={user}
                  mesAtual={state.mesAtual}
                  onSave={(newGoals) => {
                    setState(prev => ({ ...prev, customGoals: newGoals, telaAtiva: 1 }));
                    if (user) {
                      saveGoalsToFirebase(newGoals);
                    } else {
                      showToast("Metas salvas apenas localmente. Faça login para salvar na nuvem.", "info");
                    }
                  }}
                  onBack={() => irParaTela(1)}
                />
              </motion.div>
            )}

            {state.telaAtiva === 6 && (
              <motion.div 
                key="tela6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-5xl mx-auto"
              >
                <div className="flex items-center gap-4 mb-8">
                  <button onClick={() => irParaTela(1)} className="p-2 hover:bg-white/60 rounded-full transition-colors">
                    <ArrowLeft size={24} className="text-azul" />
                  </button>
                  <div>
                    <h2 className="text-3xl font-headline font-black text-azul tracking-tight">Histórico Regional</h2>
                    <p className="text-texto-muted font-medium mt-1">Histórico de importações de planilhas</p>
                  </div>
                </div>

                <div className="glass-card rounded-3xl p-8 border border-white/40 shadow-xl">
                  {state.importHistory && state.importHistory.length > 0 ? (
                    <div className="space-y-6">
                      {state.importHistory.map((entry, idx) => (
                        <div key={entry.id} className="bg-white/40 p-6 rounded-2xl border border-white/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                          <div className="flex items-start gap-4">
                            <div className="w-12 h-12 bg-azul/10 rounded-xl flex items-center justify-center text-azul shrink-0">
                              <FileSpreadsheet size={24} />
                            </div>
                            <div>
                              <h4 className="font-bold text-texto">{entry.fileName}</h4>
                              <p className="text-sm text-texto-muted mt-1">
                                Importado por: <span className="font-medium text-azul">{entry.userEmail}</span>
                              </p>
                              <p className="text-xs text-texto-muted mt-1">
                                {new Date(entry.timestamp).toLocaleString('pt-BR')}
                              </p>
                            </div>
                          </div>
                          {idx === 0 && (
                            <span className="bg-verde/10 text-verde px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border border-verde/20">
                              Atual
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-20 h-20 bg-black/5 rounded-full flex items-center justify-center mx-auto mb-4">
                        <History size={32} className="text-texto-muted" />
                      </div>
                      <h3 className="text-lg font-bold text-texto mb-2">Nenhum histórico encontrado</h3>
                      <p className="text-texto-muted">As importações de planilhas aparecerão aqui.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <footer className="mt-12 pb-6 text-center text-xs font-medium text-texto-muted">
        desenvolvido por Fabio e Bruna. Versão 1.0.0
      </footer>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast.visible && (
          <motion.div
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-8 left-1/2 z-[100] px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 text-white font-bold text-sm ${
              toast.type === 'success' ? 'bg-verde' : toast.type === 'error' ? 'bg-critico' : 'bg-azul'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 size={18} />}
            {toast.type === 'error' && <AlertTriangle size={18} />}
            {toast.type === 'info' && <Info size={18} />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-Components ---

function Accordion({ title, icon, children, defaultOpen = false, action }: { title: string, icon: ReactNode, children: ReactNode, defaultOpen?: boolean, action?: ReactNode }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-white/60 shadow-sm mb-4">
      <div 
        className="px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-white/40 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
            <ChevronDown size={20} className="text-azul" />
          </motion.div>
          <h3 className="text-lg font-bold text-azul flex items-center gap-2">
            {icon}
            {title}
          </h3>
        </div>
        {action && <div onClick={(e) => e.stopPropagation()}>{action}</div>}
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6 pt-0 border-t border-white/20">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function GoalsScreen({ customGoals, user, mesAtual, onSave, onBack }: { customGoals: any, user: User | null, mesAtual: number, onSave: (goals: any) => void, onBack: () => void }) {
  const [selectedUnitId, setSelectedUnitId] = useState(Object.keys(UNIDADES)[0]);
  const [activeTab, setActiveTab] = useState<'eficiencia' | 'qualidade' | 'crescimento'>('eficiencia');
  const [localGoals, setLocalGoals] = useState(customGoals);
  const [editingCC, setEditingCC] = useState<{ pilar: string, type: string, name: string } | null>(null);
  const [newCCName, setNewCCName] = useState('');
  const [isAddingCC, setIsAddingCC] = useState<{ pilar: string, type: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ pilar: string, type: string, name: string } | null>(null);

  const unit = UNIDADES[selectedUnitId];
  const unitGoals = localGoals[selectedUnitId] || {};

  const revenueList = getCombinedList(unit.pilares.eficiencia.centrosCusto?.receita || [], unitGoals, 'eficiencia', 'receita');
  const expenseList = getCombinedList(unit.pilares.eficiencia.centrosCusto?.despesa || [], unitGoals, 'eficiencia', 'despesa');
  const productsList = getCombinedList(unit.pilares.crescimento.produtos || [], unitGoals, 'crescimento', 'produtos');
  const modalidadesList = getCombinedList(unit.pilares.qualidade?.modalidades || [{ nome: 'Evasão de Matrícula', metaEvasao: 5.0 }], unitGoals, 'qualidade', 'evasao');

  const handleAddCC = (pilar: string, type: string) => {
    if (!newCCName.trim()) return;
    
    setLocalGoals((prev: any) => {
      const uGoals = prev[selectedUnitId] || { eficiencia: { receita: {}, despesa: {} }, qualidade: {}, crescimento: { produtos: {} } };
      const pGoals = uGoals[pilar] || {};
      const tGoals = pGoals[type] || {};
      
      return {
        ...prev,
        [selectedUnitId]: {
          ...uGoals,
          [pilar]: {
            ...pGoals,
            [type]: {
              ...tGoals,
              [newCCName]: { metaMes: 0, metaAnual: 0, metasMensais: Array(12).fill(0), deleted: false }
            }
          }
        }
      };
    });
    setNewCCName('');
    setIsAddingCC(null);
  };

  const handleDeleteCC = (pilar: string, type: string, ccName: string) => {
    setLocalGoals((prev: any) => {
      const uGoals = prev[selectedUnitId] || { eficiencia: { receita: {}, despesa: {} }, qualidade: {}, crescimento: { produtos: {} } };
      const pGoals = uGoals[pilar] || {};
      const tGoals = pGoals[type] || {};
      
      return {
        ...prev,
        [selectedUnitId]: {
          ...uGoals,
          [pilar]: {
            ...pGoals,
            [type]: {
              ...tGoals,
              [ccName]: { ...(tGoals[ccName] || {}), deleted: true }
            }
          }
        }
      };
    });
    setConfirmDelete(null);
  };

  const handleGoalChange = (pilar: string, type: string, ccName: string, field: 'metaMes' | 'metaAnual', value: string) => {
    const numValue = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
    setLocalGoals((prev: any) => {
      const unitGoals = prev[selectedUnitId] || { eficiencia: { receita: {}, despesa: {} }, qualidade: {}, crescimento: { produtos: {} } };
      const pilarGoals = unitGoals[pilar] || {};
      
      let newPilarGoals = { ...pilarGoals };
      
      if (ccName === '_root') {
        const g = pilarGoals[type] || { metaMes: 0, metaAnual: 0, metasMensais: Array(12).fill(0) };
        const newG = { ...g, [field]: numValue };
        if (field === 'metaMes' && (!g.metasMensais || g.metasMensais.every((v: number) => v === 0))) {
          newG.metasMensais = Array(12).fill(numValue);
        }
        newPilarGoals[type] = newG;
      } else {
        const typeGoals = pilarGoals[type] || {};
        const ccGoal = typeGoals[ccName] || { metaMes: 0, metaAnual: 0, metasMensais: Array(12).fill(0) };
        const newCCGoal = { ...ccGoal, [field]: numValue };
        if (field === 'metaMes' && (!ccGoal.metasMensais || ccGoal.metasMensais.every((v: number) => v === 0))) {
          newCCGoal.metasMensais = Array(12).fill(numValue);
        }
        newPilarGoals[type] = { ...typeGoals, [ccName]: newCCGoal };
      }

      return { ...prev, [selectedUnitId]: { ...unitGoals, [pilar]: newPilarGoals } };
    });
  };

  const handleMonthlyGoalChange = (pilar: string, type: string, ccName: string, monthIdx: number, value: string | number) => {
    const numValue = typeof value === 'number' ? value : (parseFloat(value.replace(/[^0-9.-]/g, '')) || 0);
    setLocalGoals((prev: any) => {
      const unitGoals = prev[selectedUnitId] || { eficiencia: { receita: {}, despesa: {} }, qualidade: {}, crescimento: { produtos: {} } };
      const pilarGoals = unitGoals[pilar] || {};
      
      let newPilarGoals = { ...pilarGoals };
      
      if (ccName === '_root') {
        const g = pilarGoals[type] || { metaMes: 0, metaAnual: 0, metasMensais: Array(12).fill(0) };
        const newMetas = [...(g.metasMensais || Array(12).fill(g.metaMes || 0))];
        newMetas[monthIdx] = numValue;
        newPilarGoals[type] = { ...g, metasMensais: newMetas, metaAnual: newMetas.reduce((a, b) => a + b, 0) };
      } else {
        const typeGoals = pilarGoals[type] || {};
        const ccGoal = typeGoals[ccName] || { metaMes: 0, metaAnual: 0, metasMensais: Array(12).fill(0) };
        const newMetas = [...(ccGoal.metasMensais || Array(12).fill(ccGoal.metaMes || 0))];
        newMetas[monthIdx] = numValue;
        newPilarGoals[type] = { 
          ...typeGoals, 
          [ccName]: { ...ccGoal, metasMensais: newMetas, metaAnual: newMetas.reduce((a, b) => a + b, 0) } 
        };
      }

      return { ...prev, [selectedUnitId]: { ...unitGoals, [pilar]: newPilarGoals } };
    });
  };

  const getGoalValue = (pilar: string, type: string, ccName: string, field: 'metaMes' | 'metaAnual', defaultValue: number) => {
    const unitGoals = localGoals[selectedUnitId];
    if (!unitGoals || !unitGoals[pilar]) return field === 'metaAnual' ? defaultValue * 12 : defaultValue;
    
    const pilarGoals = unitGoals[pilar];
    if (ccName === '_root') {
      return pilarGoals[type] ? pilarGoals[type][field] : (field === 'metaAnual' ? defaultValue * 12 : defaultValue);
    }
    
    if (pilarGoals[type] && pilarGoals[type][ccName]) {
      return pilarGoals[type][ccName][field];
    }
    return field === 'metaAnual' ? defaultValue * 12 : defaultValue;
  };

  const getMonthlyGoalValue = (pilar: string, type: string, ccName: string, monthIdx: number, defaultValue: number) => {
    const unitGoals = localGoals[selectedUnitId];
    if (!unitGoals || !unitGoals[pilar]) return defaultValue;
    
    const pilarGoals = unitGoals[pilar];
    const g = ccName === '_root' ? pilarGoals[type] : (pilarGoals[type] ? pilarGoals[type][ccName] : null);
    
    if (g && g.metasMensais) return g.metasMensais[monthIdx];
    return defaultValue;
  };

  const copyRevenueToExpense = () => {
    setLocalGoals((prev: any) => {
      const unitGoals = prev[selectedUnitId] || { eficiencia: { receita: {}, despesa: {} } };
      const efGoals = unitGoals.eficiencia || { receita: {}, despesa: {} };
      return {
        ...prev,
        [selectedUnitId]: {
          ...unitGoals,
          eficiencia: { ...efGoals, despesa: { ...efGoals.receita } }
        }
      };
    });
  };

  const replicateToAllMonths = (pilar: string, type: string, ccName: string) => {
    setLocalGoals((prev: any) => {
      const uGoals = prev[selectedUnitId] || {};
      const pGoals = uGoals[pilar] || {};
      
      let newPGoals = { ...pGoals };
      
      if (ccName === '_root') {
        const g = pGoals[type] || { metaMes: 0, metaAnual: 0, metasMensais: Array(12).fill(0) };
        const val = g.metasMensais ? g.metasMensais[0] : g.metaMes;
        const newMetas = Array(12).fill(val);
        newPGoals[type] = { ...g, metasMensais: newMetas, metaAnual: newMetas.reduce((a, b) => a + b, 0) };
      } else {
        const tGoals = pGoals[type] || {};
        const ccGoal = tGoals[ccName] || { metaMes: 0, metaAnual: 0, metasMensais: Array(12).fill(0) };
        const val = ccGoal.metasMensais ? ccGoal.metasMensais[0] : ccGoal.metaMes;
        const newMetas = Array(12).fill(val);
        newPGoals[type] = { 
          ...tGoals, 
          [ccName]: { ...ccGoal, metasMensais: newMetas, metaAnual: newMetas.reduce((a, b) => a + b, 0) } 
        };
      }

      return { ...prev, [selectedUnitId]: { ...uGoals, [pilar]: newPGoals } };
    });
  };

  const renderTable = (title: string, icon: ReactNode, pilar: string, type: string, list: any[], defaultValueField: string, isCurrency: boolean) => (
    <Accordion title={title} icon={icon} defaultOpen={true}>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-azul/5 text-azul">
              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest">Item</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-right">Meta Mês Atual ({NOMES_MESES[mesAtual]})</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-right">Meta Anual (Soma)</th>
              <th className="px-4 py-3 text-xs font-black uppercase tracking-widest text-center w-16">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/20">
            {list.map((item, idx) => {
              const defaultVal = item[defaultValueField] || (type === 'evasao' ? 5 : 0);
              const currentMonthVal = getMonthlyGoalValue(pilar, type, item.nome, mesAtual, defaultVal);
              const annualVal = getGoalValue(pilar, type, item.nome, 'metaAnual', defaultVal * 12);
              
              return (
                <tr key={idx} className="hover:bg-white/40 transition-colors group">
                  <td className="px-4 py-3">
                    <button 
                      onClick={() => setEditingCC({ pilar, type, name: item.nome })}
                      className="text-xs font-medium text-left hover:text-azul hover:underline flex items-center gap-2"
                      title="Editar todos os meses"
                    >
                      {item.nome}
                      <Calendar size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {isCurrency ? (
                      <CurrencyInput
                        value={currentMonthVal}
                        onChange={(val) => handleMonthlyGoalChange(pilar, type, item.nome, mesAtual, val)}
                        className="w-full bg-white/50 border border-white/40 rounded-lg px-3 py-1.5 text-right text-xs font-mono focus:ring-2 focus:ring-azul/20 outline-none"
                      />
                    ) : (
                      <input 
                        type="number"
                        step={type === 'evasao' ? "0.1" : "1"}
                        value={currentMonthVal}
                        onChange={(e) => handleMonthlyGoalChange(pilar, type, item.nome, mesAtual, e.target.value)}
                        className="w-full bg-white/50 border border-white/40 rounded-lg px-3 py-1.5 text-right text-xs font-mono focus:ring-2 focus:ring-azul/20 outline-none"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-right text-xs font-mono text-texto-muted px-3 py-1.5">
                      {isCurrency ? formatBRL(annualVal) : (type === 'evasao' ? `${(annualVal / 12).toFixed(1)}%` : annualVal)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button 
                      onClick={() => setConfirmDelete({ pilar, type, name: item.nome })}
                      className="text-texto-muted hover:text-critico p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Excluir"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
            {isAddingCC?.pilar === pilar && isAddingCC?.type === type ? (
              <tr className="bg-white/60">
                <td className="px-4 py-3" colSpan={4}>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={newCCName}
                      onChange={e => setNewCCName(e.target.value)}
                      placeholder="Nome do novo item..."
                      className="flex-1 bg-white border border-white/40 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-azul/20 outline-none"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && handleAddCC(pilar, type)}
                    />
                    <button onClick={() => handleAddCC(pilar, type)} className="bg-azul text-white px-3 py-1.5 rounded-lg text-xs font-bold">Salvar</button>
                    <button onClick={() => { setIsAddingCC(null); setNewCCName(''); }} className="bg-white/50 text-texto-muted px-3 py-1.5 rounded-lg text-xs font-bold">Cancelar</button>
                  </div>
                </td>
              </tr>
            ) : (
              <tr>
                <td className="px-4 py-3" colSpan={4}>
                  <button 
                    onClick={() => setIsAddingCC({ pilar, type })}
                    className="text-xs font-bold text-azul hover:underline flex items-center gap-1"
                  >
                    + Adicionar Novo
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Accordion>
  );

  return (
    <div className="space-y-8 pb-20">
      {!user && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-700 px-4 py-3 rounded-xl flex items-center gap-3">
          <AlertTriangle size={20} />
          <p className="text-sm font-medium">Você não está logado. As metas serão salvas apenas temporariamente neste navegador.</p>
        </div>
      )}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-headline font-extrabold tracking-tight text-azul">Configuração de Metas</h1>
          <p className="text-texto-muted font-medium mt-1">Defina as metas mensais e anuais por centro de custo e indicador</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={onBack}
            className="px-6 py-2.5 rounded-xl border border-azul/20 text-azul font-bold hover:bg-azul/5 transition-all"
          >
            Cancelar
          </button>
          <button 
            onClick={() => onSave(localGoals)}
            className="px-6 py-2.5 rounded-xl bg-azul text-white font-bold shadow-lg shadow-azul/20 hover:bg-azul-dark transition-all"
          >
            Salvar Metas
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <div className="glass-panel p-6 rounded-2xl border border-white/40 flex-1">
          <label className="block text-xs font-black text-texto-muted uppercase tracking-widest mb-3">Selecionar Unidade</label>
          <div className="flex flex-wrap gap-2">
            {Object.values(UNIDADES).map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedUnitId(u.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                  selectedUnitId === u.id 
                    ? 'bg-azul text-white border-azul shadow-md' 
                    : 'bg-white/40 text-texto-muted border-white/40 hover:bg-white/60'
                }`}
              >
                {u.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl border border-white/40 flex-1">
          <label className="block text-xs font-black text-texto-muted uppercase tracking-widest mb-3">Selecionar Pilar</label>
          <div className="flex gap-2">
            {(['eficiencia', 'qualidade', 'crescimento'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-2 rounded-xl text-xs font-bold transition-all border ${
                  activeTab === tab 
                    ? 'bg-azul text-white border-azul shadow-md' 
                    : 'bg-white/40 text-texto-muted border-white/40 hover:bg-white/60'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {activeTab === 'eficiencia' && (
          <>
            <div className="grid grid-cols-1 gap-4">
              {renderTable('Metas de Receita', <TrendingUp size={20} className="text-verde" />, 'eficiencia', 'receita', revenueList, 'metaMes', true)}
              {renderTable('Metas de Despesa', <TrendingUp size={20} className="text-critico" />, 'eficiencia', 'despesa', expenseList, 'metaMes', true)}
            </div>
            
            <div className="flex justify-end">
              <button 
                onClick={copyRevenueToExpense}
                className="text-xs font-bold text-azul hover:underline flex items-center gap-1"
              >
                <Upload size={14} />
                Copiar Centros de Custo de Receita para Despesa
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Accordion title="Matrículas" icon={<Users size={20} className="text-azul" />} defaultOpen={true}>
                <div className="p-4">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-bold text-texto">Meta de Matrículas</p>
                      <p className="text-xs text-texto-muted">Meta global da unidade</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <label className="text-[10px] font-black text-texto-muted uppercase tracking-widest">Mês Atual</label>
                        <input 
                          type="number"
                          value={getMonthlyGoalValue('eficiencia', 'matriculas', '_root', mesAtual, unit.pilares.eficiencia.meses[mesAtual].metaMatMes)}
                          onChange={(e) => handleMonthlyGoalChange('eficiencia', 'matriculas', '_root', mesAtual, e.target.value)}
                          className="w-24 bg-white/50 border border-white/40 rounded-lg px-3 py-1.5 text-right text-xs font-mono focus:ring-2 focus:ring-azul/20 outline-none block"
                        />
                      </div>
                      <div className="text-right">
                        <label className="text-[10px] font-black text-texto-muted uppercase tracking-widest">Anual</label>
                        <div className="text-sm font-mono font-bold text-azul px-3 py-1.5">
                          {getGoalValue('eficiencia', 'matriculas', '_root', 'metaAnual', unit.pilares.eficiencia.meses[mesAtual].metaMatMes * 12)}
                        </div>
                      </div>
                      <button 
                        onClick={() => setEditingCC({ pilar: 'eficiencia', type: 'matriculas', name: '_root' })}
                        className="p-2 text-texto-muted hover:text-azul hover:bg-white/60 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Editar todos os meses"
                      >
                        <Calendar size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </Accordion>

              <Accordion title="Hora-Aluno" icon={<Clock size={20} className="text-laranja" />} defaultOpen={true}>
                <div className="p-4">
                  <div className="flex items-center justify-between group">
                    <div>
                      <p className="text-sm font-bold text-texto">Meta de Hora-Aluno</p>
                      <p className="text-xs text-texto-muted">Meta global da unidade</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <label className="text-[10px] font-black text-texto-muted uppercase tracking-widest">Mês Atual</label>
                        <input 
                          type="number"
                          value={getMonthlyGoalValue('eficiencia', 'horaAluno', '_root', mesAtual, unit.pilares.eficiencia.meses[mesAtual].metaHaMes)}
                          onChange={(e) => handleMonthlyGoalChange('eficiencia', 'horaAluno', '_root', mesAtual, e.target.value)}
                          className="w-24 bg-white/50 border border-white/40 rounded-lg px-3 py-1.5 text-right text-xs font-mono focus:ring-2 focus:ring-azul/20 outline-none block"
                        />
                      </div>
                      <div className="text-right">
                        <label className="text-[10px] font-black text-texto-muted uppercase tracking-widest">Anual</label>
                        <div className="text-sm font-mono font-bold text-azul px-3 py-1.5">
                          {getGoalValue('eficiencia', 'horaAluno', '_root', 'metaAnual', unit.pilares.eficiencia.meses[mesAtual].metaHaMes * 12)}
                        </div>
                      </div>
                      <button 
                        onClick={() => setEditingCC({ pilar: 'eficiencia', type: 'horaAluno', name: '_root' })}
                        className="p-2 text-texto-muted hover:text-azul hover:bg-white/60 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Editar todos os meses"
                      >
                        <Calendar size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </Accordion>
            </div>
          </>
        )}

        {activeTab === 'qualidade' && (
          <div className="grid grid-cols-1 gap-4">
            {renderTable('Evasão de Matrícula', <ShieldCheck size={20} className="text-azul" />, 'qualidade', 'evasao', modalidadesList, 'metaEvasao', false)}
          </div>
        )}

        {activeTab === 'crescimento' && (
          <div className="grid grid-cols-1 gap-4">
            {renderTable('Metas de Crescimento (Produtos)', <TrendingUp size={20} className="text-verde" />, 'crescimento', 'produtos', productsList, 'metaMes', true)}
          </div>
        )}
      </div>

      {/* Monthly Goals Modal */}
      <AnimatePresence>
        {editingCC && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditingCC(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-white rounded-3xl shadow-2xl z-[101] overflow-hidden border border-white/40"
            >
              <div className="bg-azul p-6 text-white">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-bold">Metas Mensais — 2026</h3>
                    <p className="text-white/70 text-sm font-medium mt-1">
                      {editingCC.name === '_root' ? editingCC.type.toUpperCase() : editingCC.name} ({editingCC.pilar.toUpperCase()})
                    </p>
                  </div>
                  <button onClick={() => setEditingCC(null)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                    <LogOut size={20} className="rotate-180" />
                  </button>
                </div>
              </div>
              <div className="p-8 max-h-[70vh] overflow-y-auto">
                <div className="flex justify-end mb-4">
                  <button 
                    onClick={() => replicateToAllMonths(editingCC.pilar, editingCC.type, editingCC.name)}
                    className="text-xs font-bold text-azul hover:underline flex items-center gap-1"
                  >
                    <Upload size={14} />
                    Replicar Mês 1 para todos
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
                  {NOMES_MESES.map((mes, idx) => {
                    const isCurrency = editingCC.type === 'receita' || editingCC.type === 'despesa' || editingCC.type === 'produtos';
                    return (
                      <div key={idx} className="space-y-2">
                        <label className="text-xs font-black text-texto-muted uppercase tracking-widest">{mes}</label>
                        {isCurrency ? (
                          <CurrencyInput
                            value={getMonthlyGoalValue(editingCC.pilar, editingCC.type, editingCC.name, idx, 0)}
                            onChange={(val) => handleMonthlyGoalChange(editingCC.pilar, editingCC.type, editingCC.name, idx, val)}
                            className="w-full bg-fundo/50 border border-black/5 rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-azul/20 outline-none transition-all"
                          />
                        ) : (
                          <input 
                            type="number"
                            step={editingCC.type === 'evasao' ? "0.1" : "1"}
                            value={getMonthlyGoalValue(editingCC.pilar, editingCC.type, editingCC.name, idx, 0)}
                            onChange={(e) => handleMonthlyGoalChange(editingCC.pilar, editingCC.type, editingCC.name, idx, e.target.value)}
                            className="w-full bg-fundo/50 border border-black/5 rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-azul/20 outline-none transition-all"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                
                <div className="mt-10 p-6 bg-azul/5 rounded-2xl border border-azul/10 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-black text-texto-muted uppercase tracking-widest">Total Anual Calculado (Soma)</p>
                    <p className="text-2xl font-headline font-extrabold text-azul">
                      {editingCC.type === 'evasao' 
                        ? `${(getGoalValue(editingCC.pilar, editingCC.type, editingCC.name, 'metaAnual', 0) / 12).toFixed(1)}% (Média)`
                        : (editingCC.type === 'matriculas' || editingCC.type === 'horaAluno' 
                            ? getGoalValue(editingCC.pilar, editingCC.type, editingCC.name, 'metaAnual', 0)
                            : formatBRL(getGoalValue(editingCC.pilar, editingCC.type, editingCC.name, 'metaAnual', 0)))}
                    </p>
                  </div>
                  <button 
                    onClick={() => setEditingCC(null)}
                    className="bg-azul text-white px-6 py-2.5 rounded-xl font-bold hover:bg-azul-mid transition-colors"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Confirm Delete Modal */}
      <AnimatePresence>
        {confirmDelete && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDelete(null)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-3xl shadow-2xl z-[101] overflow-hidden border border-white/40 p-6"
            >
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 bg-critico/10 text-critico rounded-full flex items-center justify-center mb-4">
                  <AlertTriangle size={32} />
                </div>
                <h3 className="text-xl font-bold text-azul mb-2">Confirmar Exclusão</h3>
                <p className="text-texto-muted mb-8">
                  Tem certeza que deseja excluir o item <span className="font-bold text-texto">"{confirmDelete.name}"</span>? Esta ação pode ser desfeita recarregando a página (se não salvar).
                </p>
                
                <div className="flex gap-3 w-full">
                  <button 
                    onClick={() => setConfirmDelete(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-azul/20 text-azul font-bold hover:bg-azul/5 transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={() => handleDeleteCC(confirmDelete.pilar, confirmDelete.type, confirmDelete.name)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-critico text-white font-bold shadow-lg shadow-critico/20 hover:bg-critico/90 transition-all"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidebarItem({ icon, label, active = false, onClick, collapsed = false }: { icon: any, label: string, active?: boolean, onClick?: () => void, collapsed?: boolean }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl w-full transition-all duration-200 ${
        active 
          ? 'text-azul bg-azul/5 border border-azul/10 shadow-sm font-bold' 
          : 'text-texto-muted hover:bg-white/60 font-medium'
      } ${collapsed ? 'justify-center px-0' : ''}`}
      title={collapsed ? label : undefined}
    >
      <span className={`${active ? 'text-azul' : 'text-texto-muted'}`}>{icon}</span>
      {!collapsed && <span className="text-sm tracking-tight truncate">{label}</span>}
    </button>
  );
}

function SidebarSubItem({ label, active = false, onClick }: { label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-1.5 rounded-lg w-full transition-all duration-200 text-left ${
        active 
          ? 'text-azul font-bold bg-azul/5' 
          : 'text-texto-muted hover:text-azul font-medium'
      }`}
    >
      <span className="text-[13px] tracking-tight">{label}</span>
    </button>
  );
}

function TrimestreSelector({ activeTrim, onSelect }: { activeTrim: number, onSelect: (t: 1 | 2 | 3 | 4) => void }) {
  const labels = {
    1: 'JAN-MAR',
    2: 'ABR-JUN',
    3: 'JUL-SET',
    4: 'OUT-DEZ'
  };

  return (
    <div className="flex bg-white/40 p-1 rounded-xl border border-white/30 shadow-inner">
      {[1, 2, 3, 4].map(t => (
        <button
          key={t}
          onClick={() => onSelect(t as 1 | 2 | 3 | 4)}
          className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all ${
            activeTrim === t 
              ? 'bg-azul text-white shadow-md' 
              : 'text-texto-muted hover:bg-white/60'
          }`}
        >
          {labels[t as keyof typeof labels]}
        </button>
      ))}
    </div>
  );
}

function MonthSelector({ activeMes, mesFim, filtroModo, onSelect, onSelectRange }: { activeMes: number, mesFim: number, filtroModo: string, onSelect: (m: number) => void, onSelectRange: (inicio: number, fim: number) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [rangeStart, setRangeStart] = useState<number | null>(null);

  const label = filtroModo === 'mes' 
    ? NOMES_MESES[activeMes] 
    : `${NOMES_MESES[activeMes]} - ${NOMES_MESES[mesFim]}`;

  return (
    <div className="relative">
      <button 
        onClick={() => {
          setIsOpen(!isOpen);
          setRangeStart(null);
        }}
        className="glass-card px-4 py-2 rounded-xl flex items-center gap-2 border border-white/40 hover:bg-white/60 transition-all min-w-[160px]"
      >
        <Calendar size={16} className="text-azul" />
        <span className="font-bold text-xs text-azul">{label}</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setIsOpen(false)} />
            <motion.div 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-64 bg-white/90 backdrop-blur-xl border border-white/40 rounded-2xl shadow-2xl z-[70] p-4"
            >
              <div className="flex justify-between items-center mb-3 px-1">
                <span className="text-xs font-black text-texto-muted uppercase tracking-widest">
                  {rangeStart !== null ? 'Selecione o Mês Final' : 'Selecione o Período'}
                </span>
                {rangeStart !== null && (
                  <button 
                    onClick={() => setRangeStart(null)}
                    className="text-xs font-bold text-azul hover:underline"
                  >
                    Cancelar Seleção
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1">
                {NOMES_MESES.map((mes, idx) => {
                  const isSelected = filtroModo === 'mes' ? activeMes === idx : (idx >= activeMes && idx <= mesFim);
                  const isStart = rangeStart === idx;
                  const isInRange = rangeStart !== null && idx > rangeStart;

                  return (
                    <button
                      key={mes}
                      onClick={() => {
                        if (rangeStart === null) {
                          setRangeStart(idx);
                        } else {
                          const start = Math.min(rangeStart, idx);
                          const end = Math.max(rangeStart, idx);
                          if (start === end) {
                            onSelect(start);
                          } else {
                            onSelectRange(start, end);
                          }
                          setIsOpen(false);
                          setRangeStart(null);
                        }
                      }}
                      className={`px-2 py-2 rounded-lg text-xs font-bold transition-all text-center ${
                        isSelected || isStart
                          ? 'bg-azul text-white' 
                          : isInRange 
                            ? 'bg-azul/10 text-azul'
                            : 'text-texto-muted hover:bg-azul/5 hover:text-azul'
                      }`}
                    >
                      {mes.substring(0, 3)}
                    </button>
                  );
                })}
              </div>
              
              <div className="mt-4 pt-3 border-t border-black/5">
                <p className="text-xs text-texto-muted italic leading-tight">
                  Clique em um mês para selecionar. Clique em dois meses para definir um intervalo.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function UnitCard({ unit, mesInicio, mesFim, onClick, customGoals }: { unit: Unit, mesInicio: number, mesFim: number, onClick: () => void, customGoals: any, key?: any }) {
  const meses = Array.from({ length: mesFim - mesInicio + 1 }, (_, i) => mesInicio + i);
  
  const aggregatePilar = (pilarKey: 'eficiencia' | 'qualidade' | 'crescimento') => {
    let realizado = 0;
    let meta = 0;
    
    meses.forEach(m => {
      const data = unit.pilares[pilarKey].meses[m];
      if (pilarKey === 'qualidade') {
        realizado += data.realMatMes || 0;
        meta += data.metaMatMes || 0;
      } else {
        realizado += data.realizadoMes;
        meta += getEffectiveMeta(unit.id, pilarKey, m, customGoals);
      }
    });
    
    return calcPercent(realizado, meta);
  };

  const pEf = aggregatePilar('eficiencia');
  const pQu = aggregatePilar('qualidade');
  const pCr = aggregatePilar('crescimento');

  const avgPercent = (parseFloat(pEf) + parseFloat(pQu) + parseFloat(pCr)) / 3;
  const statusClass = getSemaforoClass(avgPercent);

  const themeBg = unit.tema === 'azul-verde' ? 'bg-verde' : 'bg-laranja';

  return (
    <motion.div 
      whileHover={{ y: -5 }}
      className="glass-panel rounded-2xl overflow-hidden flex flex-col group cursor-pointer"
      onClick={onClick}
    >
      <div className={`h-1.5 w-full ${themeBg}`}></div>
      <div className="p-6 flex-1">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-headline font-bold text-texto group-hover:text-azul transition-colors">{unit.nome}</h3>
            <span className="text-xs font-black tracking-widest text-texto-muted uppercase">{unit.tag}</span>
          </div>
          <div className={`px-2 py-1 rounded text-xs font-bold bg-white/50 border border-white/40 ${statusClass}`}>
            {getLabelStatus(avgPercent)}
          </div>
        </div>

        <div className="space-y-4">
          <MiniIndicator label="Eficiência" percent={pEf} />
          <MiniIndicator label="Qualidade" percent={pQu} />
          <MiniIndicator label="Crescimento" percent={pCr} />
        </div>
      </div>
      <div className="px-6 py-4 bg-white/30 border-t border-white/20 flex justify-between items-center">
        <span className="text-xs font-bold text-texto-muted uppercase tracking-wider">Ver Unidade</span>
        <ChevronRight size={14} className="text-texto-muted group-hover:translate-x-1 transition-transform" />
      </div>
    </motion.div>
  );
}

function MiniIndicator({ label, percent }: { label: string, percent: string }) {
  const colorClass = getSemaforoBgClass(percent);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-bold text-texto-muted">
        <span>{label}</span>
        <span className={getSemaforoClass(percent)}>{percent}%</span>
      </div>
      <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
        <div className={`h-full ${colorClass}`} style={{ width: `${Math.min(parseFloat(percent), 100)}%` }}></div>
      </div>
    </div>
  );
}

function PillarCard({ pilar, unitId, pilarKey, mesInicio, mesFim, trim, type, onClick, tema, customGoals }: { pilar: PillarData, unitId: string, pilarKey: string, mesInicio: number, mesFim: number, trim: number, type: 'financeiro' | 'producao' | 'crescimento', onClick: () => void, tema: string, customGoals: any }) {
  const meses = Array.from({ length: mesFim - mesInicio + 1 }, (_, i) => mesInicio + i);
  const mesesTrim = MESES_TRIMESTRE[trim as 1 | 2 | 3 | 4];
  const dataTrim = pilar.meses[mesesTrim[mesesTrim.length - 1]];

  let realizadoPeriodo = 0;
  let metaPeriodo = 0;
  
  meses.forEach(m => {
    const data = pilar.meses[m];
    if (pilarKey === 'qualidade') {
      realizadoPeriodo += data.realEvasaoMes || 0;
      metaPeriodo += getEffectiveMeta(unitId, pilarKey, m, customGoals, 'evasao');
    } else if (type === 'producao') {
      realizadoPeriodo += data.realMatMes || 0;
      metaPeriodo += getEffectiveMeta(unitId, pilarKey, m, customGoals, 'matriculas');
    } else {
      realizadoPeriodo += data.realizadoMes;
      metaPeriodo += getEffectiveMeta(unitId, pilarKey, m, customGoals);
    }
  });

  const isQualidade = pilarKey === 'qualidade';
  const avgRealizado = isQualidade ? realizadoPeriodo / meses.length : realizadoPeriodo;
  const avgMeta = isQualidade ? metaPeriodo / meses.length : metaPeriodo;

  const pMes = isQualidade ? avgRealizado.toFixed(1) : calcPercent(realizadoPeriodo, metaPeriodo);
  const pTrim = isQualidade 
    ? dataTrim.realEvasaoTrim!.toFixed(1)
    : (type === 'producao' 
        ? calcPercent(dataTrim.realMatTrim!, dataTrim.metaMatTrim!)
        : calcPercent(dataTrim.realizadoTrim, dataTrim.metaTrim));

  const semaforoClass = isQualidade ? semaforoEvasao(avgMeta, avgRealizado) : getSemaforoClass(pMes);
  const semaforoBg = isQualidade ? semaforoEvasaoBg(avgMeta, avgRealizado) : getSemaforoBgClass(pMes);
  const labelStatus = isQualidade ? labelStatusEvasao(avgMeta, avgRealizado) : getLabelStatus(pMes);

  // Progress bar logic for evasion: if realized <= meta, it's 100% "good" or something?
  // Actually, the prompt says "[barra de progresso]". For evasion, maybe it's just a visual.
  // Let's use (realized / meta) but capped and maybe inverted if needed? 
  // Usually progress bars show "completion". For evasion, maybe it shows how much of the "limit" is used.
  const progressPercent = isQualidade 
    ? Math.min((avgRealizado / avgMeta) * 100, 100)
    : Math.min(parseFloat(pMes), 100);

  return (
    <div className="glass-panel p-8 rounded-2xl flex flex-col h-full group transition-all duration-300 hover:bg-white/80">
      {/* Andar 1: Header */}
      <div className="mb-6">
        <h3 className="text-xl font-headline font-extrabold text-azul">{pilar.titulo}</h3>
        <p className="text-xs text-texto-muted font-medium">{pilar.subtitulo}</p>
      </div>

      {/* Andar 2: % Realizado / Status */}
      <div className="flex items-center justify-between mb-2">
        <span className={`text-4xl font-headline font-black ${semaforoClass}`}>
          {isQualidade ? `${pMes}%` : `${pMes}%`}
        </span>
        <div className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest text-white ${semaforoBg}`}>
          {labelStatus}
        </div>
      </div>

      {/* Andar 3: Barra de Progresso */}
      <div className="w-full h-2 bg-black/5 rounded-full overflow-hidden mb-8 border border-white/20">
        <div className={`h-full ${semaforoBg}`} style={{ width: `${progressPercent}%` }}></div>
      </div>

      {/* Andar 4: Label Mês */}
      <p className="text-xs font-black text-texto-muted uppercase tracking-widest mb-4">
        {isQualidade ? 'Meta Mês Vigente' : 'Meta Período Vigente'}
      </p>
      
      {/* Andar 5 & 6: Linhas Mês */}
      <div className="space-y-3 mb-8">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-texto-muted">
            {isQualidade ? 'Taxa de Evasão Permitida' : 'Meta'}
          </span>
          <span className="text-sm font-bold">
            {isQualidade ? `${avgMeta.toFixed(1)}%` : (type === 'producao' ? formatNum(metaPeriodo) : formatBRL(metaPeriodo))}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-texto-muted">
            {isQualidade ? 'Taxa Realizada' : 'Realizado'}
          </span>
          <span className={`text-sm font-black ${semaforoClass}`}>
            {isQualidade ? `${avgRealizado.toFixed(1)}%` : (type === 'producao' ? formatNum(realizadoPeriodo) : formatBRL(realizadoPeriodo))}
          </span>
        </div>
      </div>

      {/* Andar 7: Label Trimestre */}
      <p className="text-xs font-black text-texto-muted uppercase tracking-widest mb-4">
        {isQualidade ? 'Meta Trimestre' : 'Acumulado Trimestre'}
      </p>

      {/* Andar 8 & 9: Linhas Trimestre */}
      <div className="space-y-3 mb-10">
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-texto-muted">
            {isQualidade ? 'Taxa de Evasão Permitida' : 'Meta'}
          </span>
          <span className="text-sm font-bold">
            {isQualidade ? `${dataTrim.metaEvasaoTrim?.toFixed(1)}%` : (type === 'producao' ? formatNum(dataTrim.metaMatTrim!) : formatBRL(dataTrim.metaTrim))}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs font-medium text-texto-muted">
            {isQualidade ? 'Taxa Realizada' : 'Realizado'}
          </span>
          <span className={`text-sm font-bold ${isQualidade ? semaforoEvasao(dataTrim.metaEvasaoTrim!, dataTrim.realEvasaoTrim!) : ''}`}>
            {isQualidade ? `${dataTrim.realEvasaoTrim?.toFixed(1)}%` : (type === 'producao' ? formatNum(dataTrim.realMatTrim!) : formatBRL(dataTrim.realizadoTrim))}
          </span>
        </div>
      </div>

      {/* Andar 10: Botão */}
      <button 
        onClick={onClick}
        className="mt-auto w-full py-3 rounded-xl border border-azul/20 text-azul text-xs font-bold uppercase tracking-widest hover:bg-azul hover:text-white transition-all active:scale-95"
      >
        Ver Detalhes
      </button>
    </div>
  );
}

function EnrollmentAccordion({ pilar, unitId, mesInicio, mesFim, trim, customGoals }: { pilar: PillarData, unitId: string, mesInicio: number, mesFim: number, trim: number, customGoals: any }) {
  const [isOpen, setIsOpen] = useState(false);
  const mesesNoPeriodo = Array.from({ length: mesFim - mesInicio + 1 }, (_, i) => mesInicio + i);
  const mesesTrim = MESES_TRIMESTRE[trim as 1 | 2 | 3 | 4];
  const dataTrim = pilar.meses[mesesTrim[mesesTrim.length - 1]];

  let metaMatMes = 0;
  let realMatMes = 0;
  let metaHaMes = 0;
  let realHaMes = 0;

  mesesNoPeriodo.forEach(m => {
    const d = pilar.meses[m];
    metaMatMes += getEffectiveMeta(unitId, 'eficiencia', m, customGoals, 'matriculas');
    realMatMes += d.realMatMes || 0;
    metaHaMes += getEffectiveMeta(unitId, 'eficiencia', m, customGoals, 'horaAluno');
    realHaMes += d.realHaMes || 0;
  });

  const pMatMes = calcPercent(realMatMes, metaMatMes);
  const pHaMes = calcPercent(realHaMes, metaHaMes);
  const pMatTrim = calcPercent(dataTrim.realMatTrim!, dataTrim.metaMatTrim!);
  const pHaTrim = calcPercent(dataTrim.realHaTrim!, dataTrim.metaHaTrim!);

  return (
    <div className="mt-10 border border-white/40 rounded-2xl overflow-hidden bg-white/40 backdrop-blur-md">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-8 py-4 flex items-center justify-between bg-azul/5 hover:bg-azul/10 transition-colors"
      >
        <div className="flex items-center gap-3">
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }}>
            <ChevronRight className="text-azul" />
          </motion.div>
          <span className="font-headline font-bold text-azul">Matrículas e Hora/Aluno — Clique para expandir</span>
        </div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-8 space-y-10">
              {/* VISÃO GERAL — MÊS VIGENTE */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-texto-muted uppercase tracking-widest">Visão Geral — Período Selecionado</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-azul/10 text-azul">
                        <th className="px-6 py-3 text-xs font-black uppercase tracking-widest">Indicador</th>
                        <th className="px-6 py-3 text-xs font-black uppercase tracking-widest text-right">Meta</th>
                        <th className="px-6 py-3 text-xs font-black uppercase tracking-widest text-right">Realizado</th>
                        <th className="px-6 py-3 text-xs font-black uppercase tracking-widest text-center">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      <tr>
                        <td className="px-6 py-4 text-sm font-medium">Matrículas</td>
                        <td className="px-6 py-4 text-sm text-right font-mono">{formatNum(metaMatMes)}</td>
                        <td className="px-6 py-4 text-sm text-right font-mono">{formatNum(realMatMes)}</td>
                        <td className={`px-6 py-4 text-sm text-center font-bold ${getSemaforoClass(pMatMes)}`}>{pMatMes}%</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 text-sm font-medium">Hora/Aluno</td>
                        <td className="px-6 py-4 text-sm text-right font-mono">{formatNum(metaHaMes)}</td>
                        <td className="px-6 py-4 text-sm text-right font-mono">{formatNum(realHaMes)}</td>
                        <td className={`px-6 py-4 text-sm text-center font-bold ${getSemaforoClass(pHaMes)}`}>{pHaMes}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* VISÃO GERAL — TRIMESTRE */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-texto-muted uppercase tracking-widest">Visão Geral — Trimestre</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-azul/10 text-azul">
                        <th className="px-6 py-3 text-xs font-black uppercase tracking-widest">Indicador</th>
                        <th className="px-6 py-3 text-xs font-black uppercase tracking-widest text-right">Meta Trim</th>
                        <th className="px-6 py-3 text-xs font-black uppercase tracking-widest text-right">Realizado Trim</th>
                        <th className="px-6 py-3 text-xs font-black uppercase tracking-widest text-center">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      <tr>
                        <td className="px-6 py-4 text-sm font-medium">Matrículas</td>
                        <td className="px-6 py-4 text-sm text-right font-mono">{formatNum(pilar.meses[mesesTrim[mesesTrim.length - 1]].metaMatTrim!)}</td>
                        <td className="px-6 py-4 text-sm text-right font-mono">{formatNum(pilar.meses[mesesTrim[mesesTrim.length - 1]].realMatTrim!)}</td>
                        <td className={`px-6 py-4 text-sm text-center font-bold ${getSemaforoClass(pMatTrim)}`}>{pMatTrim}%</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 text-sm font-medium">Hora/Aluno</td>
                        <td className="px-6 py-4 text-sm text-right font-mono">{formatNum(pilar.meses[mesesTrim[mesesTrim.length - 1]].metaHaTrim!)}</td>
                        <td className="px-6 py-4 text-sm text-right font-mono">{formatNum(pilar.meses[mesesTrim[mesesTrim.length - 1]].realHaTrim!)}</td>
                        <td className={`px-6 py-4 text-sm text-center font-bold ${getSemaforoClass(pHaTrim)}`}>{pHaTrim}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* DETALHAMENTO POR MODALIDADE */}
              <div className="space-y-4">
                <h4 className="text-xs font-black text-texto-muted uppercase tracking-widest">Detalhamento por Modalidade — Mês e Trimestre</h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[800px]">
                    <thead>
                      <tr className="bg-azul text-white">
                        <th className="px-6 py-4 text-xs font-black uppercase tracking-widest">Modalidade</th>
                        <th className="px-4 py-4 text-xs font-black uppercase tracking-widest text-right">Meta Mat.</th>
                        <th className="px-4 py-4 text-xs font-black uppercase tracking-widest text-right">Real Mat.</th>
                        <th className="px-4 py-4 text-xs font-black uppercase tracking-widest text-center">%</th>
                        <th className="px-4 py-4 text-xs font-black uppercase tracking-widest text-right">Meta H/A</th>
                        <th className="px-4 py-4 text-xs font-black uppercase tracking-widest text-right">Real H/A</th>
                        <th className="px-4 py-4 text-xs font-black uppercase tracking-widest text-center">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/5">
                      {(pilar.modalidades || []).map((mod, idx) => {
                        const pMat = calcPercent(mod.realMatMes!, mod.metaMatMes!);
                        const pHa = calcPercent(mod.realHaMes!, mod.metaHaMes!);
                        return (
                          <tr key={idx} className="hover:bg-black/5 transition-colors">
                            <td className="px-6 py-4 text-sm font-medium">{mod.nome}</td>
                            <td className="px-4 py-4 text-sm text-right font-mono">{formatNum(mod.metaMatMes!)}</td>
                            <td className="px-4 py-4 text-sm text-right font-mono">{formatNum(mod.realMatMes!)}</td>
                            <td className={`px-4 py-4 text-sm text-center font-bold ${getSemaforoClass(pMat)}`}>{pMat}%</td>
                            <td className="px-4 py-4 text-sm text-right font-mono">{formatNum(mod.metaHaMes!)}</td>
                            <td className="px-4 py-4 text-sm text-right font-mono">{formatNum(mod.realHaMes!)}</td>
                            <td className={`px-4 py-4 text-sm text-center font-bold ${getSemaforoClass(pHa)}`}>{pHa}%</td>
                          </tr>
                        );
                      })}
                      <tr className="bg-azul/5 font-bold">
                        <td className="px-6 py-4 text-sm uppercase">TOTAL</td>
                        <td className="px-4 py-4 text-sm text-right font-mono">{formatNum(metaMatMes)}</td>
                        <td className="px-4 py-4 text-sm text-right font-mono">{formatNum(realMatMes)}</td>
                        <td className={`px-4 py-4 text-sm text-center font-black ${getSemaforoClass(pMatMes)}`}>{pMatMes}%</td>
                        <td className="px-4 py-4 text-sm text-right font-mono">{formatNum(metaHaMes)}</td>
                        <td className="px-4 py-4 text-sm text-right font-mono">{formatNum(realHaMes)}</td>
                        <td className={`px-4 py-4 text-sm text-center font-black ${getSemaforoClass(pHaMes)}`}>{pHaMes}%</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailView({ unit, pilarKey, mesInicio, mesFim, filtroModo, trim, importedDataRecord, customGoals }: { unit: Unit, pilarKey: string, mesInicio: number, mesFim: number, filtroModo: 'mes' | 'trimestre' | 'periodo', trim: number, importedDataRecord: Record<string, Record<number, ImportedBusinessUnit>>, customGoals: any }) {
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);
  const pilar = unit.pilares[pilarKey as keyof typeof unit.pilares];
  
  // Agregação de dados para o período selecionado
  const mesesNoPeriodo = Array.from({ length: mesFim - mesInicio + 1 }, (_, i) => mesInicio + i);
  
  const unitHistory = importedDataRecord[unit.id] || importedDataRecord[unit.nome.toLowerCase()];
  const hasAnyImport = !!unitHistory;

  const unitGoals = customGoals[unit.id] || { eficiencia: { receita: {}, despesa: {} }, qualidade: {}, crescimento: { produtos: {} } };

  if (pilarKey === 'eficiencia') {
    const efGoals = unitGoals.eficiencia || { receita: {}, despesa: {} };
    const predefinedRevenue = pilar.centrosCusto?.receita || [];
    const predefinedExpense = pilar.centrosCusto?.despesa || [];
    
    const combinedRevenue = getCombinedList(predefinedRevenue, unitGoals, 'eficiencia', 'receita');
    const combinedExpense = getCombinedList(predefinedExpense, unitGoals, 'eficiencia', 'despesa');
    
    // Mapeia Receitas Agregadas
    const revenueData = combinedRevenue.map(ecc => {
      let realizadoPeriodo = 0;
      let metaPeriodo = 0;
      let acumuladoAteFim = 0;
      let pfTotal = 0;

      const companiesMap: Record<string, number> = {};

      mesesNoPeriodo.forEach(m => {
        // Realizado Importado
        if (unitHistory && unitHistory[m]) {
          const monthCC = unitHistory[m].costCenters.find(cc => 
            cc.name.toLowerCase().includes(ecc.nome.toLowerCase()) || 
            ecc.nome.toLowerCase().includes(cc.name.toLowerCase())
          );
          if (monthCC) {
            realizadoPeriodo += monthCC.revenue.total;
            pfTotal += monthCC.revenue.pf;
            monthCC.revenueCompanies.forEach(comp => {
              companiesMap[comp.name] = (companiesMap[comp.name] || 0) + comp.value;
            });
          }
        } else {
          // Realizado Mock (se não houver importação para esse mês)
          if (!hasAnyImport) {
            realizadoPeriodo += pilar.meses[m].realizadoMes;
          }
        }

        // Meta
        const customGoal = efGoals.receita[ecc.nome];
        const metaM = (customGoal && customGoal.metasMensais && customGoal.metasMensais[m] !== undefined) 
          ? customGoal.metasMensais[m] 
          : (customGoal ? customGoal.metaMes : ecc.metaMes);
        metaPeriodo += metaM;
      });

      const companies = Object.entries(companiesMap).map(([name, value]) => ({ name, value }));

      // Acumulado (sempre do início do ano até mesFim)
      if (unitHistory) {
        Object.entries(unitHistory).forEach(([mStr, data]) => {
          const m = parseInt(mStr);
          if (m <= mesFim) {
            const monthCC = (data as ImportedBusinessUnit).costCenters.find(mcc => 
              mcc.name.toLowerCase().includes(ecc.nome.toLowerCase()) || 
              ecc.nome.toLowerCase().includes(mcc.name.toLowerCase())
            );
            if (monthCC) acumuladoAteFim += monthCC.revenue.total;
          }
        });
      } else {
        acumuladoAteFim = pilar.meses[mesFim].realizadoTrim;
      }

      const customGoal = efGoals.receita[ecc.nome];
      const metaAnualCC = (customGoal && customGoal.metasMensais)
        ? customGoal.metasMensais.reduce((a, b) => a + b, 0)
        : (customGoal ? customGoal.metaAnual : (ecc.metaMes * 12));

      return {
        nome: ecc.nome,
        metaMes: metaPeriodo,
        metaAnual: metaAnualCC,
        realizadoMes: realizadoPeriodo,
        acumulado: acumuladoAteFim,
        companies,
        pfTotal
      };
    });

    // Adiciona CCs da importação que NÃO estão nos pré-definidos
    if (unitHistory) {
      const allImportedCCNames = new Set<string>();
      mesesNoPeriodo.forEach(m => {
        if (unitHistory[m]) {
          unitHistory[m].costCenters.forEach(cc => allImportedCCNames.add(cc.name));
        }
      });

      allImportedCCNames.forEach(ccName => {
        const isPredefined = combinedRevenue.some(ecc => 
          ecc.nome.toLowerCase().includes(ccName.toLowerCase()) || 
          ccName.toLowerCase().includes(ecc.nome.toLowerCase())
        );
        
        if (!isPredefined) {
          let realizadoPeriodo = 0;
          let acumuladoAteFim = 0;
          let pfTotal = 0;

          const companiesMap: Record<string, number> = {};

          mesesNoPeriodo.forEach(m => {
            if (unitHistory[m]) {
              const monthCC = unitHistory[m].costCenters.find(mcc => mcc.name === ccName);
              if (monthCC) {
                realizadoPeriodo += monthCC.revenue.total;
                pfTotal += monthCC.revenue.pf;
                monthCC.revenueCompanies.forEach(comp => {
                  companiesMap[comp.name] = (companiesMap[comp.name] || 0) + comp.value;
                });
              }
            }
          });

          const companies = Object.entries(companiesMap).map(([name, value]) => ({ name, value }));

          Object.entries(unitHistory).forEach(([mStr, data]) => {
            const m = parseInt(mStr);
            if (m <= mesFim) {
              const monthCC = (data as ImportedBusinessUnit).costCenters.find(mcc => mcc.name === ccName);
              if (monthCC) acumuladoAteFim += monthCC.revenue.total;
            }
          });

          if (realizadoPeriodo !== 0 || acumuladoAteFim !== 0) {
            revenueData.push({
              nome: ccName,
              metaMes: 0,
              metaAnual: 0,
              realizadoMes: realizadoPeriodo,
              acumulado: acumuladoAteFim,
              companies,
              pfTotal
            });
          }
        }
      });
    }

    // Mapeia Despesas Agregadas
    const expenseData = combinedExpense.map(ecc => {
      let realizadoPeriodo = 0;
      let metaPeriodo = 0;
      let acumuladoAteFim = 0;

      const accountingGroupsMap: Record<string, number> = {};
      const companiesMap: Record<string, number> = {};

      mesesNoPeriodo.forEach(m => {
        if (unitHistory && unitHistory[m]) {
          const monthCC = unitHistory[m].costCenters.find(cc => 
            cc.name.toLowerCase().includes(ecc.nome.toLowerCase()) || 
            ecc.nome.toLowerCase().includes(cc.name.toLowerCase())
          );
          if (monthCC) {
            realizadoPeriodo += monthCC.expense.total;
            monthCC.accountingGroups.forEach(group => {
              accountingGroupsMap[group.name] = (accountingGroupsMap[group.name] || 0) + group.value;
            });
            monthCC.expenseCompanies.forEach(comp => {
              companiesMap[comp.name] = (companiesMap[comp.name] || 0) + comp.value;
            });
          }
        } else if (!hasAnyImport) {
          realizadoPeriodo += pilar.meses[m].realizadoMes; // Note: In mock, expense might be in a different place, but let's assume consistency
        }

        const customGoal = efGoals.despesa[ecc.nome];
        const metaM = (customGoal && customGoal.metasMensais && customGoal.metasMensais[m] !== undefined) 
          ? customGoal.metasMensais[m] 
          : (customGoal ? customGoal.metaMes : ecc.metaMes);
        metaPeriodo += metaM;
      });

      const accountingGroups = Object.entries(accountingGroupsMap).map(([name, value]) => ({ name, value }));
      const companies = Object.entries(companiesMap).map(([name, value]) => ({ name, value }));

      if (unitHistory) {
        Object.entries(unitHistory).forEach(([mStr, data]) => {
          const m = parseInt(mStr);
          if (m <= mesFim) {
            const monthCC = (data as ImportedBusinessUnit).costCenters.find(mcc => 
              mcc.name.toLowerCase().includes(ecc.nome.toLowerCase()) || 
              ecc.nome.toLowerCase().includes(mcc.name.toLowerCase())
            );
            if (monthCC) acumuladoAteFim += monthCC.expense.total;
          }
        });
      } else {
        acumuladoAteFim = pilar.meses[mesFim].realizadoTrim;
      }

      const customGoal = efGoals.despesa[ecc.nome];
      const metaAnualCC = (customGoal && customGoal.metasMensais)
        ? customGoal.metasMensais.reduce((a, b) => a + b, 0)
        : (customGoal ? customGoal.metaAnual : (ecc.metaMes * 12));

      return {
        nome: ecc.nome,
        metaMes: metaPeriodo,
        metaAnual: metaAnualCC,
        realizadoMes: realizadoPeriodo,
        acumulado: acumuladoAteFim,
        accountingGroups,
        companies
      };
    });

    // Adiciona CCs de despesa da importação que NÃO estão nos pré-definidos
    if (unitHistory) {
      const allImportedCCNames = new Set<string>();
      mesesNoPeriodo.forEach(m => {
        if (unitHistory[m]) {
          unitHistory[m].costCenters.forEach(cc => allImportedCCNames.add(cc.name));
        }
      });

      allImportedCCNames.forEach(ccName => {
        const isPredefined = combinedExpense.some(ecc => 
          ecc.nome.toLowerCase().includes(ccName.toLowerCase()) || 
          ccName.toLowerCase().includes(ecc.nome.toLowerCase())
        );
        
        if (!isPredefined) {
          let realizadoPeriodo = 0;
          let acumuladoAteFim = 0;

          const accountingGroupsMap: Record<string, number> = {};
          const companiesMap: Record<string, number> = {};

          mesesNoPeriodo.forEach(m => {
            if (unitHistory[m]) {
              const monthCC = unitHistory[m].costCenters.find(mcc => mcc.name === ccName);
              if (monthCC) {
                realizadoPeriodo += monthCC.expense.total;
                monthCC.accountingGroups.forEach(group => {
                  accountingGroupsMap[group.name] = (accountingGroupsMap[group.name] || 0) + group.value;
                });
                monthCC.expenseCompanies.forEach(comp => {
                  companiesMap[comp.name] = (companiesMap[comp.name] || 0) + comp.value;
                });
              }
            }
          });

          const accountingGroups = Object.entries(accountingGroupsMap).map(([name, value]) => ({ name, value }));
          const companies = Object.entries(companiesMap).map(([name, value]) => ({ name, value }));

          Object.entries(unitHistory).forEach(([mStr, data]) => {
            const m = parseInt(mStr);
            if (m <= mesFim) {
              const monthCC = (data as ImportedBusinessUnit).costCenters.find(mcc => mcc.name === ccName);
              if (monthCC) acumuladoAteFim += monthCC.expense.total;
            }
          });

          if (realizadoPeriodo !== 0 || acumuladoAteFim !== 0) {
            expenseData.push({
              nome: ccName,
              metaMes: 0,
              metaAnual: 0,
              realizadoMes: realizadoPeriodo,
              acumulado: acumuladoAteFim,
              accountingGroups,
              companies
            });
          }
        }
      });
    }

    // Totais do Período
    const totalMetaPeriodo = revenueData.reduce((acc, curr) => acc + curr.metaMes, 0);
    const totalRealizadoPeriodo = revenueData.reduce((acc, curr) => acc + curr.realizadoMes, 0);
    const totalAcumuladoAno = revenueData.reduce((acc, curr) => acc + curr.acumulado, 0);
    const totalMetaAnual = revenueData.reduce((acc, curr) => acc + curr.metaAnual, 0);

    const totalDespesaPeriodo = expenseData.reduce((acc, curr) => acc + curr.realizadoMes, 0);

    return (
      <div className="space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <SummaryCard 
            label={filtroModo === 'mes' ? "Meta Financeira Mês" : "Meta Financeira Período"} 
            value={formatBRL(totalMetaPeriodo)} 
            icon={<TrendingUp />} 
          />
          <SummaryCard 
            label={filtroModo === 'mes' ? "Realizado Financeiro Mês" : "Realizado Financeiro Período"} 
            value={formatBRL(totalRealizadoPeriodo)} 
            icon={<CheckCircle2 />} 
            percent={calcPercent(totalRealizadoPeriodo, totalMetaPeriodo)} 
          />
          <SummaryCard 
            label="Acumulado Ano" 
            value={formatBRL(totalAcumuladoAno)} 
            icon={<LayoutDashboard />} 
            percent={calcPercent(totalAcumuladoAno, totalMetaAnual)} 
          />
        </div>

        {hasAnyImport && (
          <motion.div
            key={`summary-${mesInicio}-${mesFim}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="glass-panel rounded-3xl border border-white/40 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <BarChart3 size={120} />
              </div>
              
              <div 
                className="p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 cursor-pointer hover:bg-white/20 transition-colors"
                onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-verde animate-pulse"></div>
                    <h2 className="text-2xl font-headline font-extrabold text-azul">
                      Dados Importados do Faturamento — {unit.nome}
                    </h2>
                  </div>
                  <p className="text-xs font-black text-texto-muted uppercase tracking-widest">
                    {filtroModo === 'mes' ? `Consolidado de ${NOMES_MESES[mesInicio]}` : `Consolidado de ${NOMES_MESES[mesInicio]} a ${NOMES_MESES[mesFim]}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-azul/10 text-azul text-xs font-black uppercase tracking-widest">
                  {isSummaryExpanded ? 'Recolher Resumo' : 'Expandir Resumo'}
                  <motion.div animate={{ rotate: isSummaryExpanded ? 180 : 0 }}>
                    <ChevronDown size={14} />
                  </motion.div>
                </div>
              </div>

              <AnimatePresence>
                {isSummaryExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-8 pb-8 pt-2">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                        <div className="space-y-6">
                          <div className="flex justify-between items-end">
                            <h3 className="text-sm font-black text-texto-muted uppercase tracking-widest">Resumo da Unidade (Geral)</h3>
                            <div className="text-right">
                              <p className="text-xs font-black text-verde uppercase tracking-widest">Receita</p>
                              <p className="text-3xl font-headline font-black text-verde">{formatBRL(totalRealizadoPeriodo)}</p>
                            </div>
                          </div>
                          
                          <div className="h-3 w-full bg-black/5 rounded-full overflow-hidden flex border border-white/20">
                            <div className="h-full bg-verde shadow-[0_0_15px_rgba(34,197,94,0.4)]" style={{ width: '100%' }}></div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-white/40 p-4 rounded-2xl border border-white/60">
                              <p className="text-xs font-black text-texto-muted uppercase tracking-widest mb-1">Despesa Total</p>
                              <p className="text-xl font-headline font-black text-critico">{formatBRL(totalDespesaPeriodo)}</p>
                            </div>
                            <div className="bg-white/40 p-4 rounded-2xl border border-white/60">
                              <p className="text-xs font-black text-texto-muted uppercase tracking-widest mb-1">Resultado Líquido</p>
                              <p className={`text-xl font-headline font-black ${totalRealizadoPeriodo - totalDespesaPeriodo >= 0 ? 'text-verde' : 'text-critico'}`}>
                                {formatBRL(totalRealizadoPeriodo - totalDespesaPeriodo)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                          {revenueData.slice(0, 6).map((cc, i) => (
                            <div key={i} className="space-y-2">
                              <div className="flex justify-between items-start">
                                <p className="text-[11px] font-bold text-texto leading-tight max-w-[120px] truncate" title={cc.nome}>{cc.nome}</p>
                                <p className="text-xs font-black text-verde">{formatBRL(cc.realizadoMes)}</p>
                              </div>
                              <div className="h-1 w-full bg-black/5 rounded-full overflow-hidden">
                                <div className="h-full bg-verde" style={{ width: `${Math.min((cc.realizadoMes / (totalRealizadoPeriodo || 1)) * 100, 100)}%` }}></div>
                              </div>
                              <p className="text-xs text-texto-muted text-right font-medium">Desp: {formatBRL(expenseData.find(e => e.nome === cc.nome)?.realizadoMes || 0)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 gap-10">
          <FinancialTable title="Detalhamento de Receitas" data={revenueData} color="verde" type="receita" />
          <FinancialTable title="Detalhamento de Despesas" data={expenseData} color="critico" type="despesa" />
        </div>

        {/* Accordion de Matrículas e Hora/Aluno */}
        <EnrollmentAccordion pilar={pilar} unitId={unit.id} mesInicio={mesInicio} mesFim={mesFim} trim={trim} customGoals={customGoals} />
      </div>
    );
  }

  if (pilarKey === 'qualidade') {
    const qGoals = unitGoals.qualidade || {};
    const aggregateEvasao = () => {
      let metaEvasaoMes = 0;
      let realEvasaoMes = 0;
      
      mesesNoPeriodo.forEach(m => {
        const d = pilar.meses[m];
        const customGoal = qGoals.evasao;
        const metaM = (customGoal && customGoal.metasMensais && customGoal.metasMensais[m] !== undefined)
          ? customGoal.metasMensais[m]
          : (customGoal ? customGoal.metaMes : (d.metaEvasaoMes || 0));
        
        metaEvasaoMes += metaM;
        realEvasaoMes += d.realEvasaoMes || 0;
      });
      
      const avgMeta = metaEvasaoMes / mesesNoPeriodo.length;
      const avgReal = realEvasaoMes / mesesNoPeriodo.length;
      
      return { avgMeta, avgReal };
    };
    
    const agg = aggregateEvasao();
    const mesesTrim = MESES_TRIMESTRE[trim as 1 | 2 | 3 | 4];
    const dataTrim = pilar.meses[mesesTrim[mesesTrim.length - 1]];

    const modalityData = (pilar.modalidades || []).map(m => {
      let metaPeriodo = 0;
      mesesNoPeriodo.forEach(mIdx => {
        const customGoal = qGoals.evasao && qGoals.evasao[m.nome];
        const metaM = (customGoal && customGoal.metasMensais && customGoal.metasMensais[mIdx] !== undefined)
          ? customGoal.metasMensais[mIdx]
          : (customGoal ? customGoal.metaMes : (m.metaEvasao || 5));
        metaPeriodo += metaM;
      });
      const avgMeta = metaPeriodo / mesesNoPeriodo.length;

      return {
        ...m,
        metaEvasaoMes: avgMeta,
        realEvasaoMes: m.realEvasao || 0
      };
    });

    return (
      <div className="space-y-10">
        {/* Seção 1 — Visão Geral de Evasão */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <SummaryCard 
            label="Meta de Evasão Mês" 
            value={`${agg.avgMeta.toFixed(1)}%`} 
            icon={<AlertTriangle />} 
          />
          <SummaryCard 
            label="Evasão Realizada Mês" 
            value={`${agg.avgReal.toFixed(1)}%`} 
            icon={<CheckCircle2 />} 
            percent={agg.avgReal.toFixed(1)}
            isEvasao={true}
            metaEvasao={agg.avgMeta}
          />
          <SummaryCard 
            label="Meta Evasão Trim" 
            value={`${dataTrim.metaEvasaoTrim?.toFixed(1)}%`} 
            icon={<AlertTriangle />} 
          />
          <SummaryCard 
            label="Evasão Realizada Trimestre" 
            value={`${dataTrim.realEvasaoTrim?.toFixed(1)}%`} 
            icon={<CheckCircle2 />} 
            percent={dataTrim.realEvasaoTrim?.toFixed(1)}
            isEvasao={true}
            metaEvasao={dataTrim.metaEvasaoTrim}
          />
        </div>

        {/* Seção 2 — Detalhamento por Modalidade */}
        <div className="space-y-6">
          <h3 className="text-xl font-headline font-bold text-azul">Detalhamento por Modalidade</h3>
          <Table data={modalityData} type="qualidade" />
        </div>

        {/* Seção 3 — Espaço reservado para métricas futuras */}
        <div className="p-12 border-2 border-dashed border-azul/20 rounded-3xl bg-azul/5 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-azul/10 flex items-center justify-center text-azul mb-4">
            <Info size={32} />
          </div>
          <h4 className="text-lg font-bold text-azul mb-2">[ + ] Novos indicadores de qualidade serão adicionados aqui.</h4>
          <p className="text-sm text-texto-muted max-w-md">Área reservada para expansão futura do pilar.</p>
        </div>
      </div>
    );
  }

  if (pilarKey === 'crescimento') {
    const cGoals = unitGoals.crescimento || { produtos: {} };
    const aggregateCrescimento = () => {
      let meta = 0;
      let realizado = 0;
      
      mesesNoPeriodo.forEach(m => {
        const d = pilar.meses[m];
        const products = pilar.produtos || [];
        let metaM = 0;
        products.forEach(p => {
          const customGoal = cGoals.produtos[p.nome];
          metaM += (customGoal && customGoal.metasMensais && customGoal.metasMensais[m] !== undefined)
            ? customGoal.metasMensais[m]
            : (customGoal ? customGoal.metaMes : p.metaMes);
        });
        
        meta += metaM || d.metaMes || 0;
        realizado += d.realizadoMes || 0;
      });
      
      return { meta, realizado };
    };
    
    const agg = aggregateCrescimento();
    const mesesTrim = MESES_TRIMESTRE[trim as 1 | 2 | 3 | 4];
    const dataTrim = pilar.meses[mesesTrim[mesesTrim.length - 1]];

    const productData = (pilar.produtos || []).map(p => {
      let metaPeriodo = 0;
      let realizadoPeriodo = 0;
      let acumuladoAteFim = 0;
      let pfTotal = 0;
      const companiesMap: Record<string, number> = {};

      mesesNoPeriodo.forEach(m => {
        const customGoal = cGoals.produtos[p.nome];
        metaPeriodo += (customGoal && customGoal.metasMensais && customGoal.metasMensais[m] !== undefined)
          ? customGoal.metasMensais[m]
          : (customGoal ? customGoal.metaMes : p.metaMes);

        if (unitHistory && unitHistory[m]) {
          const monthCC = unitHistory[m].costCenters.find(cc => 
            cc.name.toLowerCase().includes(p.nome.toLowerCase()) || 
            p.nome.toLowerCase().includes(cc.name.toLowerCase())
          );
          if (monthCC) {
            realizadoPeriodo += monthCC.revenue.total;
            pfTotal += monthCC.revenue.pf;
            monthCC.revenueCompanies.forEach(comp => {
              companiesMap[comp.name] = (companiesMap[comp.name] || 0) + comp.value;
            });
          }
        } else if (!hasAnyImport) {
          realizadoPeriodo += p.realizadoMes; // Mock
        }
      });

      if (unitHistory) {
        Object.entries(unitHistory).forEach(([mStr, data]) => {
          const m = parseInt(mStr);
          if (m <= mesFim) {
            const monthCC = (data as ImportedBusinessUnit).costCenters.find(mcc => 
              mcc.name.toLowerCase().includes(p.nome.toLowerCase()) || 
              p.nome.toLowerCase().includes(mcc.name.toLowerCase())
            );
            if (monthCC) acumuladoAteFim += monthCC.revenue.total;
          }
        });
      } else {
        acumuladoAteFim = p.realizadoTrim;
      }

      const customGoal = cGoals.produtos[p.nome];
      const metaAnual = (customGoal && customGoal.metasMensais)
        ? customGoal.metasMensais.reduce((a, b) => a + b, 0)
        : (customGoal ? customGoal.metaAnual : (p.metaMes * 12));

      const companies = Object.entries(companiesMap).map(([name, value]) => ({ name, value }));

      return {
        ...p,
        metaMes: metaPeriodo,
        metaAnual: metaAnual,
        realizadoMes: realizadoPeriodo,
        acumulado: acumuladoAteFim,
        companies,
        pfTotal
      };
    });

    return (
      <div className="space-y-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <SummaryCard label="Receita Meta Período" value={formatBRL(agg.meta)} icon={<TrendingUp />} />
          <SummaryCard label="Receita Real Período" value={formatBRL(agg.realizado)} icon={<CheckCircle2 />} percent={calcPercent(agg.realizado, agg.meta)} />
          <SummaryCard label="Receita Meta Trim" value={formatBRL(dataTrim.metaTrim)} icon={<TrendingUp />} />
          <SummaryCard label="Receita Real Trim" value={formatBRL(dataTrim.realizadoTrim)} icon={<CheckCircle2 />} percent={calcPercent(dataTrim.realizadoTrim, dataTrim.metaTrim)} />
        </div>

        <div className="space-y-6">
          <h3 className="text-xl font-headline font-bold text-azul">Receita por Produto / Serviço</h3>
          <Table data={productData} type="financeiro" />
        </div>
      </div>
    );
  }

  return null;
}

function ImportedDataView({ data }: { data: ImportedBusinessUnit }) {
  const [viewMode, setViewMode] = useState<'total' | 'pj' | 'pf'>('total');
  const [expandedCC, setExpandedCC] = useState<Set<string>>(new Set());

  const toggleCC = (id: string) => {
    const newSet = new Set(expandedCC);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedCC(newSet);
  };

  const getVal = (breakdown: ImportedBreakdown) => {
    if (viewMode === 'pj') return breakdown.pj;
    if (viewMode === 'pf') return breakdown.pf;
    return breakdown.total;
  };

  const chartData = useMemo(() => {
    return data.costCenters
      .map(cc => ({
        name: cc.name.length > 20 ? cc.name.substring(0, 20) + '...' : cc.name,
        Receita: getVal(cc.revenue),
        Despesa: getVal(cc.expense)
      }))
      .sort((a, b) => (b.Receita + b.Despesa) - (a.Receita + a.Despesa))
      .slice(0, 5);
  }, [data.costCenters, viewMode]);

  return (
    <div className="space-y-8 mt-12 mb-16">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-verde/10 rounded-lg text-verde">
            <FileSpreadsheet size={20} />
          </div>
          <h3 className="text-xl font-headline font-bold text-azul">Dados Importados do Faturamento — {data.name}</h3>
        </div>
        
        <div className="flex bg-black/5 p-1 rounded-xl self-start">
          {(['total', 'pj', 'pf'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${
                viewMode === mode 
                  ? 'bg-white text-azul shadow-sm' 
                  : 'text-texto-muted hover:text-azul'
              }`}
            >
              {mode === 'total' ? 'Geral' : mode.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      
      <div className="grid grid-cols-1 gap-6">
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/40">
          <div className="bg-azul/5 px-6 py-4 border-b border-white/20 flex flex-col md:flex-row justify-between md:items-center gap-4">
            <div>
              <h4 className="text-lg font-bold text-azul">Resumo da Unidade ({viewMode === 'total' ? 'Geral' : viewMode.toUpperCase()})</h4>
              <p className="text-xs font-black text-texto-muted uppercase tracking-widest">Consolidado Importado</p>
            </div>
            <div className="flex gap-8">
              <div className="text-right">
                <p className="text-xs font-black text-verde uppercase tracking-widest">Receita</p>
                <p className="text-xl font-black text-verde">{formatBRL(getVal(data.revenue))}</p>
                {viewMode === 'total' && (
                  <div className="flex gap-3 text-xs font-bold justify-end">
                    <span className="text-azul-mid">PJ: {formatBRL(data.revenue.pj)}</span>
                    <span className="text-texto-muted">PF: {formatBRL(data.revenue.pf)}</span>
                  </div>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs font-black text-critico uppercase tracking-widest">Despesa</p>
                <p className="text-xl font-black text-critico">{formatBRL(getVal(data.expense))}</p>
                {viewMode === 'total' && (
                  <div className="flex gap-3 text-xs font-bold justify-end">
                    <span className="text-azul-mid">PJ: {formatBRL(data.expense.pj)}</span>
                    <span className="text-texto-muted">PF: {formatBRL(data.expense.pf)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chart Section */}
          {chartData.length > 0 && (
            <div className="p-6 border-b border-white/20 bg-white/20">
              <h4 className="text-sm font-bold text-azul mb-4">Top 5 Centros de Custo (Receita vs Despesa)</h4>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#5a6682' }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#5a6682' }} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      formatter={(value: number) => formatBRL(value)}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px' }} />
                    <Bar dataKey="Receita" fill="#52ae32" radius={[4, 4, 0, 0]} maxBarSize={40} />
                    <Bar dataKey="Despesa" fill="#c0392b" radius={[4, 4, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
          
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.costCenters.map((cc) => {
                const isExpanded = expandedCC.has(cc.id);
                const hasCompanies = cc.revenueCompanies.length > 0 && viewMode !== 'pf';
                
                return (
                  <div 
                    key={cc.id} 
                    className={`bg-white/40 rounded-xl border border-white/30 transition-all ${
                      hasCompanies ? 'cursor-pointer hover:bg-white/60' : ''
                    }`}
                    onClick={() => hasCompanies && toggleCC(cc.id)}
                  >
                    <div className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <h5 className="font-bold text-sm text-texto">{cc.name}</h5>
                          {hasCompanies && (
                            <motion.div
                              animate={{ rotate: isExpanded ? 180 : 0 }}
                              className="text-texto-muted"
                            >
                              <ChevronRight size={14} />
                            </motion.div>
                          )}
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-verde">Rec: {formatBRL(getVal(cc.revenue))}</p>
                          <p className="text-xs font-black text-critico">Desp: {formatBRL(getVal(cc.expense))}</p>
                        </div>
                      </div>
                    </div>
                    
                    <AnimatePresence>
                      {isExpanded && hasCompanies && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-4 pb-4 pt-2 border-t border-black/5">
                            <p className="text-xs font-black text-texto-muted uppercase tracking-widest mb-2">Detalhamento Clientes PJ</p>
                            <div className="space-y-1">
                              {cc.revenueCompanies.sort((a, b) => b.value - a.value).map((company, idx) => (
                                <div 
                                  key={idx} 
                                  className="flex justify-between text-xs py-1.5 border-b border-black/5 last:border-0 group/item"
                                  title={company.name}
                                >
                                  <span className="truncate max-w-[200px] group-hover/item:text-azul transition-colors">
                                    {company.name}
                                  </span>
                                  <span className="font-bold text-azul-mid">{formatBRL(company.value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Components ---

function Tooltip({ children, text }: { children: ReactNode, text: string }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div 
      className="relative inline-block w-full"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute z-[100] bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 bg-azul text-white text-xs font-bold rounded-lg shadow-xl whitespace-nowrap pointer-events-none"
          >
            {text}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-azul" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FinancialTable({ title, data, color, type }: { title: string, data: any[], color: 'verde' | 'critico', type: 'receita' | 'despesa' }) {
  const textColor = color === 'verde' ? 'text-verde' : 'text-critico';
  const bgColor = color === 'verde' ? 'bg-verde/5' : 'bg-critico/5';
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const [isTableExpanded, setIsTableExpanded] = useState(true);

  const toggleRow = (idx: number) => {
    setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  return (
    <div className="glass-panel rounded-2xl overflow-hidden border border-white/40 shadow-lg">
      <div 
        className={`px-6 py-4 border-b border-white/20 ${bgColor} flex justify-between items-center cursor-pointer hover:bg-white/20 transition-colors`}
        onClick={() => setIsTableExpanded(!isTableExpanded)}
      >
        <div className="flex items-center gap-3">
          <motion.div animate={{ rotate: isTableExpanded ? 0 : -90 }}>
            <ChevronDown size={18} className="text-azul" />
          </motion.div>
          <h3 className="text-sm font-black text-azul uppercase tracking-widest">{title}</h3>
        </div>
        <span className="text-xs font-bold text-texto-muted bg-white/40 px-2 py-1 rounded-full border border-white/60">
          {data.length} Itens
        </span>
      </div>
      
      <AnimatePresence>
        {isTableExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="overflow-x-auto scrollbar-hide">
              <table className="w-full text-left border-collapse min-w-[500px]">
                <thead>
                  <tr className="bg-black/5">
                    <th className="px-6 py-3 text-xs font-black text-texto-muted uppercase tracking-widest">Centro de Custo</th>
                    <th className="px-6 py-3 text-xs font-black text-texto-muted uppercase tracking-widest text-right">Realizado</th>
                    <th className="px-6 py-3 text-xs font-black text-texto-muted uppercase tracking-widest text-right">Meta</th>
                    <th className="px-6 py-3 text-xs font-black text-texto-muted uppercase tracking-widest text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {data.map((item, i) => {
                    const p = calcPercent(item.realizadoMes, item.metaMes);
                    const hasCompanies = item.companies && item.companies.length > 0;
                    const hasAccountingGroups = item.accountingGroups && item.accountingGroups.length > 0;
                    const hasPF = item.pfTotal > 0;
                    const hasDetail = hasCompanies || hasAccountingGroups || hasPF;
                    const isExpanded = expandedRows[i];

                    return (
                      <Fragment key={i}>
                        <tr 
                          className={`transition-colors ${hasDetail ? 'cursor-pointer hover:bg-black/5' : ''}`}
                          onClick={() => hasDetail && toggleRow(i)}
                        >
                          <td className="px-6 py-4 text-xs font-bold text-texto">
                            <div className="flex items-center gap-2">
                              {hasDetail && (
                                <motion.div animate={{ rotate: isExpanded ? 180 : 0 }}>
                                  <ChevronDown size={14} className="text-texto-muted" />
                                </motion.div>
                              )}
                              <Tooltip text={item.nome}>
                                <span className="truncate max-w-[180px] block">{item.nome}</span>
                              </Tooltip>
                            </div>
                          </td>
                          <td className={`px-6 py-4 text-xs font-black text-right ${textColor}`}>{formatBRL(item.realizadoMes)}</td>
                          <td className="px-6 py-4 text-xs font-medium text-texto-muted text-right">{formatBRL(item.metaMes)}</td>
                          <td className={`px-6 py-4 text-xs font-black text-right ${getSemaforoClass(p)}`}>{p}%</td>
                        </tr>
                        <AnimatePresence>
                          {isExpanded && hasDetail && (
                            <tr>
                              <td colSpan={4} className="px-6 py-0 border-none">
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden"
                                >
                                  <div className="py-5 pl-8 pr-6 space-y-4 bg-black/[0.03] rounded-xl mb-4 border border-black/5 mx-2">
                                    {type === 'receita' && (
                                      <>
                                        {hasCompanies && (
                                          <div>
                                            <p className="text-xs font-black text-texto-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                                              <Building2 size={12} className="text-azul" />
                                              Detalhamento PJ (Empresas)
                                            </p>
                                            <div className="grid grid-cols-1 gap-1.5">
                                              {item.companies.sort((a: any, b: any) => b.value - a.value).map((comp: any, idx: number) => (
                                                <div key={idx} className="flex justify-between items-center py-1.5 px-3 bg-white/40 rounded-lg border border-black/5 group/item">
                                                  <div className="flex items-center gap-2">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${getSemaforoBgClass(p)} shadow-sm`} />
                                                    <Tooltip text={comp.name}>
                                                      <span className="text-[11px] font-medium text-texto truncate max-w-[250px]">{comp.name}</span>
                                                    </Tooltip>
                                                  </div>
                                                  <span className={`text-[11px] font-bold ${textColor}`}>{formatBRL(comp.value)}</span>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {hasPF && (
                                          <div className="pt-2 border-t border-black/5">
                                            <div className="flex justify-between items-center py-2 px-3 bg-azul/5 rounded-lg border border-azul/10">
                                              <span className="text-xs font-black text-azul uppercase tracking-widest">Total Faturado PF (Pessoa Física)</span>
                                              <span className="text-[11px] font-black text-azul">{formatBRL(item.pfTotal)}</span>
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    )}

                                    {type === 'despesa' && hasAccountingGroups && (
                                      <div>
                                        <p className="text-xs font-black text-texto-muted uppercase tracking-widest mb-3 flex items-center gap-2">
                                          <FileText size={12} className="text-critico" />
                                          Detalhamento por Grupo Contábil
                                        </p>
                                        <div className="grid grid-cols-1 gap-1.5">
                                          {item.accountingGroups.sort((a: any, b: any) => b.value - a.value).map((group: any, idx: number) => (
                                            <div key={idx} className="flex justify-between items-center py-1.5 px-3 bg-white/40 rounded-lg border border-black/5 group/item">
                                              <div className="flex items-center gap-2">
                                                <div className={`w-1.5 h-1.5 rounded-full ${getSemaforoBgClass(p)} shadow-sm`} />
                                                <Tooltip text={group.name}>
                                                  <span className="text-[11px] font-medium text-texto truncate max-w-[250px]">{group.name}</span>
                                                </Tooltip>
                                              </div>
                                              <span className={`text-[11px] font-bold ${textColor}`}>{formatBRL(group.value)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              </td>
                            </tr>
                          )}
                        </AnimatePresence>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryCard({ label, value, icon, percent, isEvasao, metaEvasao }: { label: string, value: string, icon: any, percent?: string, isEvasao?: boolean, metaEvasao?: number }) {
  const semaforoClass = isEvasao && metaEvasao !== undefined ? semaforoEvasao(metaEvasao, parseFloat(percent || '0')) : (percent ? getSemaforoClass(percent) : '');
  const semaforoBg = isEvasao && metaEvasao !== undefined ? semaforoEvasaoBg(metaEvasao, parseFloat(percent || '0')) : (percent ? getSemaforoBgClass(percent) : '');
  
  const progressWidth = isEvasao && metaEvasao ? Math.min((parseFloat(percent || '0') / metaEvasao) * 100, 100) : (percent ? Math.min(parseFloat(percent), 100) : 0);

  return (
    <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity text-azul">
        {icon}
      </div>
      <p className="text-xs font-black text-texto-muted uppercase tracking-widest mb-2">{label}</p>
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-headline font-black text-azul">{value}</span>
        {percent && (
          <span className={`text-sm font-bold ${semaforoClass}`}>{percent}%</span>
        )}
      </div>
      {percent && (
        <div className="mt-3 w-full h-1 bg-black/5 rounded-full overflow-hidden">
          <div className={`h-full ${semaforoBg}`} style={{ width: `${progressWidth}%` }}></div>
        </div>
      )}
    </div>
  );
}

function Table({ data, type }: { data: any[], type: 'financeiro' | 'qualidade' }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  const LIMIT = 5;
  const hasMore = data.length > LIMIT;
  const displayData = isExpanded ? data : data.slice(0, LIMIT);

  const toggleRow = (idx: number) => {
    setExpandedRows(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  if (type === 'financeiro') {
    const totalMeta = data.reduce((acc, item) => acc + (item.metaMes || 0), 0);
    const totalMetaAnual = data.reduce((acc, item) => acc + (item.metaAnual || 0), 0);
    const totalReal = data.reduce((acc, item) => acc + (item.realizadoMes || 0), 0);
    const totalAcumulado = data.reduce((acc, item) => acc + (item.acumulado || 0), 0);
    const totalPercentAnual = calcPercent(totalAcumulado, totalMetaAnual);

    return (
      <div className="space-y-4">
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/40 shadow-xl">
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-azul text-white">
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest">Descrição</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-right">Meta Mês</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-right">Realizado Mês</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-right">Meta Anual</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-right">Realizado Acumulado</th>
                  <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-center">% Anual</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/20">
                {displayData.map((item, idx) => {
                  const pAnual = calcPercent(item.acumulado, item.metaAnual);
                  const hasCompanies = item.companies && item.companies.length > 0;
                  const hasPF = item.pfTotal > 0;
                  const hasDetail = hasCompanies || hasPF;
                  const isRowExpanded = expandedRows[idx];

                  return (
                    <Fragment key={idx}>
                      <tr 
                        className={`transition-colors ${hasDetail ? 'cursor-pointer hover:bg-white/40' : 'hover:bg-white/40'}`}
                        onClick={() => hasDetail && toggleRow(idx)}
                      >
                        <td className="px-6 py-4 text-sm font-medium">
                          <div className="flex items-center gap-2">
                            {hasDetail && (
                              <motion.div animate={{ rotate: isRowExpanded ? 180 : 0 }}>
                                <ChevronDown size={14} className="text-texto-muted" />
                              </motion.div>
                            )}
                            <Tooltip text={item.nome}>
                              <span className="truncate max-w-[250px] block">{item.nome}</span>
                            </Tooltip>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-right font-mono">{formatBRL(item.metaMes)}</td>
                        <td className="px-6 py-4 text-sm text-right font-mono">{formatBRL(item.realizadoMes)}</td>
                        <td className="px-6 py-4 text-sm text-right font-mono">{formatBRL(item.metaAnual)}</td>
                        <td className="px-6 py-4 text-sm text-right font-mono">{formatBRL(item.acumulado)}</td>
                        <td className={`px-6 py-4 text-sm text-center font-bold ${getSemaforoClass(pAnual)}`}>{pAnual}%</td>
                      </tr>
                      <AnimatePresence>
                        {isRowExpanded && hasDetail && (
                          <tr>
                            <td colSpan={6} className="px-6 py-0 border-none">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className="overflow-hidden"
                              >
                                <div className="py-5 pl-8 pr-6 space-y-4 bg-azul/[0.03] rounded-xl mb-4 border border-azul/10 mx-2">
                                  {hasCompanies && (
                                    <div>
                                      <p className="text-xs font-black text-azul uppercase tracking-widest mb-3 flex items-center gap-2">
                                        <Building2 size={12} />
                                        Detalhamento PJ (Empresas)
                                      </p>
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {item.companies.sort((a: any, b: any) => b.value - a.value).map((comp: any, cIdx: number) => (
                                          <div key={cIdx} className="flex justify-between items-center py-2 px-3 bg-white/60 rounded-lg border border-black/5">
                                            <Tooltip text={comp.name}>
                                              <span className="text-[11px] font-medium text-texto truncate max-w-[200px]">{comp.name}</span>
                                            </Tooltip>
                                            <span className="text-[11px] font-bold text-azul">{formatBRL(comp.value)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {hasPF && (
                                    <div className="pt-2 border-t border-black/5">
                                      <div className="flex justify-between items-center py-2 px-3 bg-azul/10 rounded-lg border border-azul/20">
                                        <span className="text-xs font-black text-azul uppercase tracking-widest">Total Faturado PF (Pessoa Física)</span>
                                        <span className="text-[11px] font-black text-azul">{formatBRL(item.pfTotal)}</span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </Fragment>
                  );
                })}
                <tr className="bg-azul/5 font-bold">
                  <td className="px-6 py-4 text-sm uppercase">TOTAL GERAL</td>
                  <td className="px-6 py-4 text-sm text-right font-mono">{formatBRL(totalMeta)}</td>
                  <td className="px-6 py-4 text-sm text-right font-mono">{formatBRL(totalReal)}</td>
                  <td className="px-6 py-4 text-sm text-right font-mono">{formatBRL(totalMetaAnual)}</td>
                  <td className="px-6 py-4 text-sm text-right font-mono">{formatBRL(totalAcumulado)}</td>
                  <td className={`px-6 py-4 text-sm text-center font-black ${getSemaforoClass(totalPercentAnual)}`}>{totalPercentAnual}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        
        {hasMore && (
          <div className="flex justify-center">
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 px-6 py-2 rounded-full bg-white border border-azul/20 text-azul text-xs font-bold uppercase tracking-widest hover:bg-azul hover:text-white transition-all shadow-sm"
            >
              {isExpanded ? (
                <>
                  <ChevronRight size={14} className="-rotate-90" />
                  Ver Menos
                </>
              ) : (
                <>
                  <ChevronRight size={14} className="rotate-90" />
                  Ver Todos ({data.length})
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  if (type === 'qualidade') {
    return (
      <div className="space-y-4">
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/40 overflow-x-auto shadow-xl">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-azul text-white">
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest">Modalidade</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-right">Meta Evas.</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-right">Real Evas.</th>
                <th className="px-6 py-4 text-xs font-black uppercase tracking-widest text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/20">
              <AnimatePresence initial={false}>
                {displayData.map((item, idx) => {
                  const statusLabel = labelStatusEvasao(item.metaEvasao, item.realEvasao);
                  const statusBg = semaforoEvasaoBg(item.metaEvasao, item.realEvasao);
                  
                  return (
                    <motion.tr 
                      key={idx} 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="hover:bg-white/40 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm font-medium">{item.nome}</td>
                      <td className="px-6 py-4 text-sm text-right font-mono">{item.metaEvasao.toFixed(1)}%</td>
                      <td className="px-6 py-4 text-sm text-right font-mono">{item.realEvasao.toFixed(1)}%</td>
                      <td className="px-6 py-4 text-sm text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-widest text-white ${statusBg}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
        
        {hasMore && (
          <div className="flex justify-center">
            <button 
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-2 px-6 py-2 rounded-full bg-white border border-azul/20 text-azul text-xs font-bold uppercase tracking-widest hover:bg-azul hover:text-white transition-all shadow-sm"
            >
              {isExpanded ? (
                <>
                  <ChevronRight size={14} className="-rotate-90" />
                  Ver Menos
                </>
              ) : (
                <>
                  <ChevronRight size={14} className="rotate-90" />
                  Ver Todos ({data.length})
                </>
              )}
            </button>
          </div>
        )}
      </div>
    );
  }

  return null;
}

