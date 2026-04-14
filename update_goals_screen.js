const fs = require('fs');

let content = fs.readFileSync('src/App.tsx', 'utf8');

const goalsScreenStart = content.indexOf('function GoalsScreen({');
const goalsScreenEnd = content.indexOf('function HistoryScreen({', goalsScreenStart);

if (goalsScreenStart === -1 || goalsScreenEnd === -1) {
    console.error("Could not find GoalsScreen");
    process.exit(1);
}

const newGoalsScreen = `function GoalsScreen({ customGoals, user, mesAtual, onSave, onBack }: { customGoals: any, user: User | null, mesAtual: number, onSave: (goals: any) => void, onBack: () => void }) {
  const [selectedUnitId, setSelectedUnitId] = useState(Object.keys(UNIDADES)[0]);
  const [activeTab, setActiveTab] = useState<'eficiencia' | 'qualidade' | 'crescimento'>('eficiencia');
  const [localGoals, setLocalGoals] = useState(customGoals);
  const [editingCC, setEditingCC] = useState<{ pilar: string, type: string, name: string } | null>(null);
  const [newCCName, setNewCCName] = useState('');
  const [isAddingCC, setIsAddingCC] = useState<{ pilar: string, type: string } | null>(null);

  const unit = UNIDADES[selectedUnitId];
  const unitGoals = localGoals[selectedUnitId] || {};
  
  const getCombinedList = (predefined: any[], pilar: string, type: string) => {
    const customMap = unitGoals[pilar]?.[type] || {};
    const list = [...predefined];
    const predefinedNames = new Set(predefined.map(p => p.nome));
    
    Object.keys(customMap).forEach(name => {
      if (!predefinedNames.has(name) && !customMap[name].deleted) {
        list.push({ nome: name, metaMes: customMap[name].metaMes || 0 });
      }
    });
    
    return list.filter(item => !customMap[item.nome]?.deleted);
  };

  const revenueList = getCombinedList(unit.pilares.eficiencia.centrosCusto?.receita || [], 'eficiencia', 'receita');
  const expenseList = getCombinedList(unit.pilares.eficiencia.centrosCusto?.despesa || [], 'eficiencia', 'despesa');
  const productsList = getCombinedList(unit.pilares.crescimento.produtos || [], 'crescimento', 'produtos');
  const modalidadesList = getCombinedList(unit.pilares.qualidade?.modalidades || [{ nome: 'Evasão de Matrícula', metaEvasao: 5.0 }], 'qualidade', 'evasao');

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
    if (!window.confirm(\`Tem certeza que deseja excluir "\${ccName}"?\`)) return;
    
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
  };

  const handleMonthlyGoalChange = (pilar: string, type: string, ccName: string, monthIdx: number, value: string) => {
    const numValue = parseFloat(value.replace(/[^0-9.]/g, '')) || 0;
    setLocalGoals((prev: any) => {
      const uGoals = prev[selectedUnitId] || { eficiencia: { receita: {}, despesa: {} }, qualidade: {}, crescimento: { produtos: {} } };
      const pGoals = uGoals[pilar] || {};
      
      let newPGoals = { ...pGoals };
      
      if (ccName === '_root') {
        const g = pGoals[type] || { metaMes: 0, metaAnual: 0, metasMensais: Array(12).fill(0) };
        const newMetas = [...(g.metasMensais || Array(12).fill(g.metaMes || 0))];
        newMetas[monthIdx] = numValue;
        newPGoals[type] = { ...g, metasMensais: newMetas, metaAnual: newMetas.reduce((a, b) => a + b, 0) };
      } else {
        const tGoals = pGoals[type] || {};
        const ccGoal = tGoals[ccName] || { metaMes: 0, metaAnual: 0, metasMensais: Array(12).fill(0) };
        const newMetas = [...(ccGoal.metasMensais || Array(12).fill(ccGoal.metaMes || 0))];
        newMetas[monthIdx] = numValue;
        newPGoals[type] = { 
          ...tGoals, 
          [ccName]: { ...ccGoal, metasMensais: newMetas, metaAnual: newMetas.reduce((a, b) => a + b, 0) } 
        };
      }

      return { ...prev, [selectedUnitId]: { ...uGoals, [pilar]: newPGoals } };
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

  const getGoalValue = (pilar: string, type: string, ccName: string, field: 'metaMes' | 'metaAnual', defaultValue: number) => {
    const uGoals = localGoals[selectedUnitId];
    if (!uGoals || !uGoals[pilar]) return field === 'metaAnual' ? defaultValue * 12 : defaultValue;
    
    const pGoals = uGoals[pilar];
    if (ccName === '_root') {
      return pGoals[type] ? pGoals[type][field] : (field === 'metaAnual' ? defaultValue * 12 : defaultValue);
    }
    
    if (pGoals[type] && pGoals[type][ccName]) {
      return pGoals[type][ccName][field];
    }
    return field === 'metaAnual' ? defaultValue * 12 : defaultValue;
  };

  const getMonthlyGoalValue = (pilar: string, type: string, ccName: string, monthIdx: number, defaultValue: number) => {
    const uGoals = localGoals[selectedUnitId];
    if (!uGoals || !uGoals[pilar]) return defaultValue;
    
    const pGoals = uGoals[pilar];
    const g = ccName === '_root' ? pGoals[type] : (pGoals[type] ? pGoals[type][ccName] : null);
    
    if (g && g.metasMensais) return g.metasMensais[monthIdx];
    return defaultValue;
  };

  const copyRevenueToExpense = () => {
    setLocalGoals((prev: any) => {
      const uGoals = prev[selectedUnitId] || { eficiencia: { receita: {}, despesa: {} } };
      const efGoals = uGoals.eficiencia || { receita: {}, despesa: {} };
      return {
        ...prev,
        [selectedUnitId]: {
          ...uGoals,
          eficiencia: { ...efGoals, despesa: { ...efGoals.receita } }
        }
      };
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
              const annualVal = getGoalValue(pilar, type, item.nome, 'metaAnual', defaultVal);
              
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
                    <input 
                      type="number"
                      step={type === 'evasao' ? "0.1" : "1"}
                      value={currentMonthVal}
                      onChange={(e) => handleMonthlyGoalChange(pilar, type, item.nome, mesAtual, e.target.value)}
                      className="w-full bg-white/50 border border-white/40 rounded-lg px-3 py-1.5 text-right text-xs font-mono focus:ring-2 focus:ring-azul/20 outline-none"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-right text-xs font-mono text-texto-muted px-3 py-1.5">
                      {isCurrency ? formatBRL(annualVal) : (type === 'evasao' ? \`\${annualVal / 12}%\` : annualVal)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button 
                      onClick={() => handleDeleteCC(pilar, type, item.nome)}
                      className="text-texto-muted hover:text-critico p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Excluir"
                    >
                      <LogOut size={14} />
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
            className="px-4 py-2 rounded-xl text-sm font-bold text-texto-muted bg-white/60 hover:bg-white/80 transition-colors"
          >
            Cancelar
          </button>
          <button 
            onClick={() => onSave(localGoals)}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white bg-azul hover:bg-azul-mid transition-colors shadow-lg shadow-azul/20 flex items-center gap-2"
          >
            <CheckCircle2 size={18} />
            Salvar Alterações
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="w-64 shrink-0">
          <label className="block text-xs font-black text-texto-muted uppercase tracking-widest mb-3">Selecionar Unidade</label>
          <div className="space-y-1">
            {Object.values(UNIDADES).map(u => (
              <button
                key={u.id}
                onClick={() => setSelectedUnitId(u.id)}
                className={\`w-full text-left px-4 py-3 rounded-xl text-sm font-bold transition-all \${
                  selectedUnitId === u.id 
                    ? 'bg-azul text-white shadow-md' 
                    : 'bg-white/40 text-texto-muted hover:bg-white/60'
                }\`}
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
                className={\`flex-1 px-4 py-2 rounded-xl text-xs font-bold transition-all border \${
                  activeTab === tab 
                    ? 'bg-azul text-white border-azul shadow-md' 
                    : 'bg-white/40 text-texto-muted border-white/40 hover:bg-white/60'
                }\`}
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
                          {getGoalValue('eficiencia', 'matriculas', '_root', 'metaAnual', unit.pilares.eficiencia.meses[mesAtual].metaMatMes)}
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
                          {getGoalValue('eficiencia', 'horaAluno', '_root', 'metaAnual', unit.pilares.eficiencia.meses[mesAtual].metaHaMes)}
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
                  {NOMES_MESES.map((mes, idx) => (
                    <div key={idx} className="space-y-2">
                      <label className="text-xs font-black text-texto-muted uppercase tracking-widest">{mes}</label>
                      <input 
                        type="number"
                        step={editingCC.type === 'evasao' ? "0.1" : "1"}
                        value={getMonthlyGoalValue(editingCC.pilar, editingCC.type, editingCC.name, idx, 0)}
                        onChange={(e) => handleMonthlyGoalChange(editingCC.pilar, editingCC.type, editingCC.name, idx, e.target.value)}
                        className="w-full bg-fundo/50 border border-black/5 rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-azul/20 outline-none transition-all"
                      />
                    </div>
                  ))}
                </div>
                
                <div className="mt-10 p-6 bg-azul/5 rounded-2xl border border-azul/10 flex justify-between items-center">
                  <div>
                    <p className="text-xs font-black text-texto-muted uppercase tracking-widest">Total Anual Calculado (Soma)</p>
                    <p className="text-2xl font-headline font-extrabold text-azul">
                      {editingCC.type === 'evasao' 
                        ? \`\${(getGoalValue(editingCC.pilar, editingCC.type, editingCC.name, 'metaAnual', 0) / 12).toFixed(1)}% (Média)\`
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
    </div>
  );
}
`;

content = content.substring(0, goalsScreenStart) + newGoalsScreen + content.substring(goalsScreenEnd);

fs.writeFileSync('src/App.tsx', content);
console.log("GoalsScreen updated successfully.");
