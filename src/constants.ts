import { Unit } from './types';

const generateMonths = (baseMeta: number, baseReal: number, isQuality: boolean = false) => {
  const months: any = {};
  for (let i = 0; i < 12; i++) {
    const variation = 0.9 + Math.random() * 0.2; // 90% to 110%
    const meta = baseMeta;
    const real = Math.round(baseReal * variation);
    const trimMeta = meta * 3;
    const trimReal = real * 3; // Simplified for mock

    if (isQuality) {
      months[i] = {
        metaMes: 0,
        realizadoMes: 0,
        metaTrim: 0,
        realizadoTrim: 0,
        metaEvasaoMes: 5.0,
        realEvasaoMes: parseFloat((4.5 + Math.random() * 1.5).toFixed(1)),
        metaEvasaoTrim: 5.0,
        realEvasaoTrim: parseFloat((4.5 + Math.random() * 1.5).toFixed(1))
      };
    } else {
      months[i] = {
        metaMes: meta,
        realizadoMes: real,
        metaTrim: trimMeta,
        realizadoTrim: trimReal,
        // Enrollment data moved here
        metaMatMes: Math.round(meta / 500),
        realMatMes: Math.round(real / 500),
        metaHaMes: Math.round(meta / 15),
        realHaMes: Math.round(real / 15),
        metaMatTrim: Math.round(trimMeta / 500),
        realMatTrim: Math.round(trimReal / 500),
        metaHaTrim: Math.round(trimMeta / 15),
        realHaTrim: Math.round(trimReal / 15)
      };
    }
  }
  return months;
};

export const UNIDADES: Record<string, Unit> = {
  sesi_jp: {
    id: 'sesi_jp',
    nome: 'SESI Jardim da Penha',
    tipo: 'SESI',
    tag: 'UNIDADE EDUCACIONAL',
    tema: 'azul-verde',
    pilares: {
      eficiencia: {
        titulo: 'Eficiência',
        subtitulo: 'Performance Financeira da Unidade',
        meses: {
          0: { metaMes: 180000, realizadoMes: 162000, metaTrim: 540000, realizadoTrim: 475000, metaMatMes: 320, realMatMes: 298, metaHaMes: 9600, realHaMes: 8940, metaMatTrim: 960, realMatTrim: 894, metaHaTrim: 28800, realHaTrim: 26820 },
          1: { metaMes: 180000, realizadoMes: 170000, metaTrim: 540000, realizadoTrim: 475000, metaMatMes: 320, realMatMes: 310, metaHaMes: 9600, realHaMes: 9200, metaMatTrim: 960, realMatTrim: 894, metaHaTrim: 28800, realHaTrim: 26820 },
          2: { metaMes: 180000, realizadoMes: 143000, metaTrim: 540000, realizadoTrim: 475000, metaMatMes: 320, realMatMes: 286, metaHaMes: 9600, realHaMes: 8680, metaMatTrim: 960, realMatTrim: 894, metaHaTrim: 28800, realHaTrim: 26820 },
          3: { metaMes: 185000, realizadoMes: 162000, metaTrim: 555000, realizadoTrim: 490000, metaMatMes: 330, realMatMes: 315, metaHaMes: 9900, realHaMes: 9450, metaMatTrim: 990, realMatTrim: 940, metaHaTrim: 29700, realHaTrim: 28200 },
          4: { metaMes: 185000, realizadoMes: 188000, metaTrim: 555000, realizadoTrim: 490000, metaMatMes: 330, realMatMes: 325, metaHaMes: 9900, realHaMes: 9750, metaMatTrim: 990, realMatTrim: 940, metaHaTrim: 29700, realHaTrim: 28200 },
          5: { metaMes: 185000, realizadoMes: 140000, metaTrim: 555000, realizadoTrim: 490000, metaMatMes: 330, realMatMes: 300, metaHaMes: 9900, realHaMes: 9000, metaMatTrim: 990, realMatTrim: 940, metaHaTrim: 29700, realHaTrim: 28200 },
          6: { metaMes: 190000, realizadoMes: 175000, metaTrim: 570000, realizadoTrim: 520000, metaMatMes: 340, realMatMes: 332, metaHaMes: 10200, realHaMes: 9960, metaMatTrim: 1020, realMatTrim: 996, metaHaTrim: 30600, realHaTrim: 29880 },
          7: { metaMes: 190000, realizadoMes: 182000, metaTrim: 570000, realizadoTrim: 520000, metaMatMes: 340, realMatMes: 338, metaHaMes: 10200, realHaMes: 10100, metaMatTrim: 1020, realMatTrim: 996, metaHaTrim: 30600, realHaTrim: 29880 },
          8: { metaMes: 190000, realizadoMes: 163000, metaTrim: 570000, realizadoTrim: 520000, metaMatMes: 340, realMatMes: 326, metaHaMes: 10200, realHaMes: 9780, metaMatTrim: 1020, realMatTrim: 996, metaHaTrim: 30600, realHaTrim: 29880 },
          9: { metaMes: 195000, realizadoMes: 190000, metaTrim: 585000, realizadoTrim: 560000, metaMatMes: 350, realMatMes: 342, metaHaMes: 10500, realHaMes: 10260, metaMatTrim: 1050, realMatTrim: 1026, metaHaTrim: 31500, realHaTrim: 30780 },
          10: { metaMes: 195000, realizadoMes: 178000, metaTrim: 585000, realizadoTrim: 560000, metaMatMes: 350, realMatMes: 345, metaHaMes: 10500, realHaMes: 10350, metaMatTrim: 1050, realMatTrim: 1026, metaHaTrim: 31500, realHaTrim: 30780 },
          11: { metaMes: 195000, realizadoMes: 192000, metaTrim: 585000, realizadoTrim: 560000, metaMatMes: 350, realMatMes: 339, metaHaMes: 10500, realHaMes: 10170, metaMatTrim: 1050, realMatTrim: 1026, metaHaTrim: 31500, realHaTrim: 30780 },
        },
        modalidades: [
          { nome: 'Aprendizagem Industrial', metaMatMes: 80, realMatMes: 74, metaHaMes: 2400, realHaMes: 2220, metaMatTrim: 240, realMatTrim: 222, metaHaTrim: 7200, realHaTrim: 6660 },
          { nome: 'Qualificação Profissional', metaMatMes: 90, realMatMes: 85, metaHaMes: 2700, realHaMes: 2550, metaMatTrim: 270, realMatTrim: 255, metaHaTrim: 8100, realHaTrim: 7650 },
          { nome: 'Técnico', metaMatMes: 70, realMatMes: 65, metaHaMes: 2100, realHaMes: 1950, metaMatTrim: 210, realMatTrim: 195, metaHaTrim: 6300, realHaTrim: 5850 },
          { nome: 'Graduação Tecnológica', metaMatMes: 50, realMatMes: 45, metaHaMes: 1500, realHaMes: 1350, metaMatTrim: 150, realMatTrim: 135, metaHaTrim: 4500, realHaTrim: 4050 },
          { nome: 'Educação Continuada', metaMatMes: 30, realMatMes: 29, metaHaMes: 900, realHaMes: 870, metaMatTrim: 90, realMatTrim: 87, metaHaTrim: 2700, realHaTrim: 2610 },
        ],
        centrosCusto: {
          receita: [
            { nome: 'CC01 — Receita Básica', metaMes: 50000, realizadoMes: 45000, metaTrim: 150000, realizadoTrim: 132000 },
            { nome: 'CC02 — Suporte e Apoio', metaMes: 38000, realizadoMes: 36000, metaTrim: 114000, realizadoTrim: 108000 },
            { nome: 'CC03 — Projeto Especial', metaMes: 40000, realizadoMes: 40000, metaTrim: 120000, realizadoTrim: 118000 },
            { nome: 'CC04 — Serviços Externos', metaMes: 30000, realizadoMes: 25000, metaTrim: 90000, realizadoTrim: 72000 },
            { nome: 'CC05 — Consultoria Digital', metaMes: 22000, realizadoMes: 16000, metaTrim: 66000, realizadoTrim: 45000 },
          ],
          despesa: [
            { nome: 'CC01 — Receita Básica', metaMes: 40000, realizadoMes: 38000, metaTrim: 120000, realizadoTrim: 115000 },
            { nome: 'CC02 — Suporte e Apoio', metaMes: 30000, realizadoMes: 28000, metaTrim: 90000, realizadoTrim: 85000 },
            { nome: 'CC03 — Projeto Especial', metaMes: 35000, realizadoMes: 32000, metaTrim: 105000, realizadoTrim: 96000 },
            { nome: 'CC04 — Serviços Externos', metaMes: 25000, realizadoMes: 22000, metaTrim: 75000, realizadoTrim: 68000 },
            { nome: 'CC05 — Consultoria Digital', metaMes: 18000, realizadoMes: 15000, metaTrim: 54000, realizadoTrim: 46000 },
          ]
        }
      },
      qualidade: {
        titulo: 'Qualidade',
        subtitulo: 'Evasão de Matrícula',
        meses: {
          0: { metaEvasaoMes: 5.0, realEvasaoMes: 4.8, metaEvasaoTrim: 5.0, realEvasaoTrim: 4.9 },
          1: { metaEvasaoMes: 5.0, realEvasaoMes: 5.2, metaEvasaoTrim: 5.0, realEvasaoTrim: 4.9 },
          2: { metaEvasaoMes: 5.0, realEvasaoMes: 4.6, metaEvasaoTrim: 5.0, realEvasaoTrim: 4.9 },
          3: { metaEvasaoMes: 5.0, realEvasaoMes: 4.8, metaEvasaoTrim: 5.0, realEvasaoTrim: 4.9 },
          4: { metaEvasaoMes: 5.0, realEvasaoMes: 5.2, metaEvasaoTrim: 5.0, realEvasaoTrim: 4.9 },
          5: { metaEvasaoMes: 5.0, realEvasaoMes: 4.6, metaEvasaoTrim: 5.0, realEvasaoTrim: 4.9 },
          6: { metaEvasaoMes: 5.0, realEvasaoMes: 4.8, metaEvasaoTrim: 5.0, realEvasaoTrim: 4.9 },
          7: { metaEvasaoMes: 5.0, realEvasaoMes: 5.2, metaEvasaoTrim: 5.0, realEvasaoTrim: 4.9 },
          8: { metaEvasaoMes: 5.0, realEvasaoMes: 4.6, metaEvasaoTrim: 5.0, realEvasaoTrim: 4.9 },
          9: { metaEvasaoMes: 5.0, realEvasaoMes: 4.8, metaEvasaoTrim: 5.0, realEvasaoTrim: 4.9 },
          10: { metaEvasaoMes: 5.0, realEvasaoMes: 5.2, metaEvasaoTrim: 5.0, realEvasaoTrim: 4.9 },
          11: { metaEvasaoMes: 5.0, realEvasaoMes: 4.6, metaEvasaoTrim: 5.0, realEvasaoTrim: 4.9 },
        },
        modalidades: [
          { nome: 'Aprendizagem Industrial', metaEvasao: 5.0, realEvasao: 0.0 },
          { nome: 'Qualificação Profissional', metaEvasao: 5.0, realEvasao: 0.0 },
          { nome: 'Técnico', metaEvasao: 5.0, realEvasao: 0.0 },
          { nome: 'Graduação Tecnológica', metaEvasao: 5.0, realEvasao: 0.0 },
          { nome: 'Educação Continuada', metaEvasao: 5.0, realEvasao: 0.0 },
        ]
      },
      crescimento: {
        titulo: 'Crescimento',
        subtitulo: 'Receita de Serviços',
        meses: {
          0: { metaMes: 95000, realizadoMes: 88000, metaTrim: 285000, realizadoTrim: 264000 },
          1: { metaMes: 95000, realizadoMes: 92000, metaTrim: 285000, realizadoTrim: 264000 },
          2: { metaMes: 95000, realizadoMes: 84000, metaTrim: 285000, realizadoTrim: 264000 },
          3: { metaMes: 98000, realizadoMes: 95000, metaTrim: 294000, realizadoTrim: 280000 },
          4: { metaMes: 98000, realizadoMes: 99000, metaTrim: 294000, realizadoTrim: 280000 },
          5: { metaMes: 98000, realizadoMes: 86000, metaTrim: 294000, realizadoTrim: 280000 },
          6: { metaMes: 102000, realizadoMes: 98000, metaTrim: 306000, realizadoTrim: 295000 },
          7: { metaMes: 102000, realizadoMes: 105000, metaTrim: 306000, realizadoTrim: 295000 },
          8: { metaMes: 102000, realizadoMes: 92000, metaTrim: 306000, realizadoTrim: 295000 },
          9: { metaMes: 106000, realizadoMes: 103000, metaTrim: 318000, realizadoTrim: 310000 },
          10: { metaMes: 106000, realizadoMes: 108000, metaTrim: 318000, realizadoTrim: 310000 },
          11: { metaMes: 106000, realizadoMes: 99000, metaTrim: 318000, realizadoTrim: 310000 },
        },
        produtos: [
          { nome: 'Serviço 01 — Consultoria', metaMes: 25000, realizadoMes: 23000, metaTrim: 75000, realizadoTrim: 69000 },
          { nome: 'Serviço 02 — Treinamento', metaMes: 22000, realizadoMes: 21000, metaTrim: 66000, realizadoTrim: 63000 },
          { nome: 'Serviço 03 — Certificação', metaMes: 20000, realizadoMes: 18000, metaTrim: 60000, realizadoTrim: 54000 },
          { nome: 'Serviço 04 — Assessoria', metaMes: 18000, realizadoMes: 16000, metaTrim: 54000, realizadoTrim: 48000 },
          { nome: 'Serviço 05 — Outros', metaMes: 10000, realizadoMes: 10000, metaTrim: 30000, realizadoTrim: 30000 },
        ]
      }
    }
  },
  sesi_maruipe: {
    id: 'sesi_maruipe',
    nome: 'SESI Maruípe',
    tipo: 'SESI',
    tag: 'UNIDADE EDUCACIONAL',
    tema: 'azul-verde',
    pilares: {
      eficiencia: {
        titulo: 'Eficiência',
        subtitulo: 'Performance Financeira da Unidade',
        meses: generateMonths(145000, 148000),
        centrosCusto: {
          receita: [
            { nome: 'CC01 — Receita Básica', metaMes: 40000, realizadoMes: 38000, metaTrim: 120000, realizadoTrim: 115000 },
            { nome: 'CC02 — Suporte e Apoio', metaMes: 35000, realizadoMes: 37000, metaTrim: 105000, realizadoTrim: 110000 },
            { nome: 'CC03 — Serviços Externos', metaMes: 70000, realizadoMes: 73000, metaTrim: 210000, realizadoTrim: 215000 },
          ],
          despesa: [
            { nome: 'CC01 — Receita Básica', metaMes: 35000, realizadoMes: 32000, metaTrim: 105000, realizadoTrim: 98000 },
            { nome: 'CC02 — Suporte e Apoio', metaMes: 30000, realizadoMes: 31000, metaTrim: 90000, realizadoTrim: 93000 },
            { nome: 'CC03 — Serviços Externos', metaMes: 60000, realizadoMes: 62000, metaTrim: 180000, realizadoTrim: 185000 },
          ]
        }
      },
      qualidade: {
        titulo: 'Qualidade',
        subtitulo: 'Horas Aula / Produção Pedagógica',
        meses: generateMonths(270, 195, true)
      },
      crescimento: {
        titulo: 'Crescimento',
        subtitulo: 'Receita de Serviços',
        meses: generateMonths(72000, 52000)
      }
    }
  },
  senai_bm: {
    id: 'senai_bm',
    nome: 'SENAI Beira Mar',
    tipo: 'SENAI',
    tag: 'UNIDADE EDUCACIONAL',
    tema: 'azul-laranja',
    pilares: {
      eficiencia: {
        titulo: 'Eficiência',
        subtitulo: 'Performance Financeira da Unidade',
        meses: generateMonths(320000, 198000),
        centrosCusto: {
          receita: [
            { nome: 'Aperfeiçoamento à Distância', metaMes: 25000, realizadoMes: 0, metaTrim: 75000, realizadoTrim: 0 },
            { nome: 'Aperfeiçoamento Presencial', metaMes: 9454, realizadoMes: 0, metaTrim: 28362, realizadoTrim: 0 },
            { nome: 'Gestão da Educação', metaMes: 20000, realizadoMes: 0, metaTrim: 60000, realizadoTrim: 0 },
            { nome: 'Gestão das Unidades Operacionais - Educação', metaMes: 0, realizadoMes: 0, metaTrim: 0, realizadoTrim: 0 },
            { nome: 'Iniciação Profissional à Distância', metaMes: 30000, realizadoMes: 0, metaTrim: 90000, realizadoTrim: 0 },
            { nome: 'Iniciação Profissional Presencial', metaMes: 45000, realizadoMes: 0, metaTrim: 135000, realizadoTrim: 0 },
            { nome: 'Qualificação Profissional à Distância', metaMes: 40000, realizadoMes: 0, metaTrim: 120000, realizadoTrim: 0 },
            { nome: 'Qualificação Profissional Presencial', metaMes: 14313, realizadoMes: 0, metaTrim: 42939, realizadoTrim: 0 },
            { nome: 'Técnico de Nível Médio à Distância', metaMes: 12702, realizadoMes: 0, metaTrim: 38106, realizadoTrim: 0 },
            { nome: 'Técnico de Nível Médio Presencial', metaMes: 44456, realizadoMes: 0, metaTrim: 133368, realizadoTrim: 0 },
            { nome: 'Proj SENAI Porto de Vitória', metaMes: 0, realizadoMes: 0, metaTrim: 0, realizadoTrim: 0 },
          ],
          despesa: [
            { nome: 'Aperfeiçoamento à Distância', metaMes: 20000, realizadoMes: 0, metaTrim: 60000, realizadoTrim: 0 },
            { nome: 'Aperfeiçoamento Presencial', metaMes: 8000, realizadoMes: 0, metaTrim: 24000, realizadoTrim: 0 },
            { nome: 'Gestão da Educação', metaMes: 15000, realizadoMes: 0, metaTrim: 45000, realizadoTrim: 0 },
            { nome: 'Gestão das Unidades Operacionais - Educação', metaMes: 10000, realizadoMes: 0, metaTrim: 30000, realizadoTrim: 0 },
            { nome: 'Iniciação Profissional à Distância', metaMes: 25000, realizadoMes: 0, metaTrim: 75000, realizadoTrim: 0 },
            { nome: 'Iniciação Profissional Presencial', metaMes: 40000, realizadoMes: 0, metaTrim: 120000, realizadoTrim: 0 },
            { nome: 'Qualificação Profissional à Distância', metaMes: 35000, realizadoMes: 0, metaTrim: 105000, realizadoTrim: 0 },
            { nome: 'Qualificação Profissional Presencial', metaMes: 12000, realizadoMes: 0, metaTrim: 36000, realizadoTrim: 0 },
            { nome: 'Técnico de Nível Médio à Distância', metaMes: 10000, realizadoMes: 0, metaTrim: 30000, realizadoTrim: 0 },
            { nome: 'Técnico de Nível Médio Presencial', metaMes: 35000, realizadoMes: 0, metaTrim: 105000, realizadoTrim: 0 },
          ]
        }
      },
      qualidade: {
        titulo: 'Qualidade',
        subtitulo: 'Horas Aula / Produção Pedagógica',
        meses: generateMonths(510, 498, true)
      },
      crescimento: {
        titulo: 'Crescimento',
        subtitulo: 'Receita de Serviços',
        meses: generateMonths(185000, 206000)
      }
    }
  },
  senai_porto: {
    id: 'senai_porto',
    nome: 'SENAI Porto',
    tipo: 'SENAI',
    tag: 'UNIDADE EDUCACIONAL',
    tema: 'azul-laranja',
    pilares: {
      eficiencia: {
        titulo: 'Eficiência',
        subtitulo: 'Performance Financeira da Unidade',
        meses: generateMonths(280000, 265000),
        centrosCusto: {
          receita: [
            { nome: 'Aperfeiçoamento/Especialização à Distância', metaMes: 22000, realizadoMes: 0, metaTrim: 66000, realizadoTrim: 0 },
            { nome: 'Aperfeiçoamento/Especialização Presencial', metaMes: 32000, realizadoMes: 0, metaTrim: 96000, realizadoTrim: 0 },
            { nome: 'Gestão da Educação', metaMes: 18000, realizadoMes: 0, metaTrim: 54000, realizadoTrim: 0 },
            { nome: 'Gestão das Unidades Operacionais - Educação', metaMes: 12000, realizadoMes: 0, metaTrim: 36000, realizadoTrim: 0 },
            { nome: 'Iniciação Profissional à Distância', metaMes: 28000, realizadoMes: 0, metaTrim: 84000, realizadoTrim: 0 },
            { nome: 'Iniciação Profissional Presencial', metaMes: 42000, realizadoMes: 0, metaTrim: 126000, realizadoTrim: 0 },
            { nome: 'Qualificação Profissional à Distância', metaMes: 38000, realizadoMes: 0, metaTrim: 114000, realizadoTrim: 0 },
            { nome: 'Qualificação Profissional Presencial', metaMes: 52000, realizadoMes: 0, metaTrim: 156000, realizadoTrim: 0 },
            { nome: 'Técnico de Nível Médio à Distância', metaMes: 22000, realizadoMes: 0, metaTrim: 66000, realizadoTrim: 0 },
            { nome: 'Técnico de Nível Médio Presencial', metaMes: 28000, realizadoMes: 0, metaTrim: 84000, realizadoTrim: 0 },
          ],
          despesa: [
            { nome: 'Aperfeiçoamento/Especialização à Distância', metaMes: 18000, realizadoMes: 0, metaTrim: 54000, realizadoTrim: 0 },
            { nome: 'Aperfeiçoamento/Especialização Presencial', metaMes: 28000, realizadoMes: 0, metaTrim: 84000, realizadoTrim: 0 },
            { nome: 'Gestão da Educação', metaMes: 15000, realizadoMes: 0, metaTrim: 45000, realizadoTrim: 0 },
            { nome: 'Gestão das Unidades Operacionais - Educação', metaMes: 10000, realizadoMes: 0, metaTrim: 30000, realizadoTrim: 0 },
            { nome: 'Iniciação Profissional à Distância', metaMes: 22000, realizadoMes: 0, metaTrim: 66000, realizadoTrim: 0 },
            { nome: 'Iniciação Profissional Presencial', metaMes: 35000, realizadoMes: 0, metaTrim: 105000, realizadoTrim: 0 },
            { nome: 'Qualificação Profissional à Distância', metaMes: 32000, realizadoMes: 0, metaTrim: 96000, realizadoTrim: 0 },
            { nome: 'Qualificação Profissional Presencial', metaMes: 45000, realizadoMes: 0, metaTrim: 135000, realizadoTrim: 0 },
            { nome: 'Técnico de Nível Médio à Distância', metaMes: 18000, realizadoMes: 0, metaTrim: 54000, realizadoTrim: 0 },
            { nome: 'Técnico de Nível Médio Presencial', metaMes: 22000, realizadoMes: 0, metaTrim: 66000, realizadoTrim: 0 },
          ]
        }
      },
      qualidade: {
        titulo: 'Qualidade',
        subtitulo: 'Horas Aula / Produção Pedagógica',
        meses: generateMonths(440, 415, true)
      },
      crescimento: {
        titulo: 'Crescimento',
        subtitulo: 'Receita de Serviços',
        meses: generateMonths(140000, 129000)
      }
    }
  }
};

export const NOMES_MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export const MESES_TRIMESTRE = {
  1: [0, 1, 2],
  2: [3, 4, 5],
  3: [6, 7, 8],
  4: [9, 10, 11]
};
