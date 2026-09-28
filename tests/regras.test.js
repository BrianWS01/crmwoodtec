// Testes de js/regras.js. Objetos montados aqui mesmo, só com os campos que cada regra usa.
// Nada é gravado no banco.
import { teste, igual, igualProfundo, verdadeiro, falso } from './harness.js';
import {
  DIAS_PARADO, diferencaDias, slugEtapa, diasNaEtapa, situacaoFollowUp, estaParado,
  filtrarLeads, ordenarPorPrioridade, resumoPorEtapa, contarSituacoes, inicial, matizDoNome,
} from '../js/regras.js';

const AGORA = new Date(2026, 8, 28, 10, 0); // 28/09/2026 10h (hora local)
const diasAtras = (n) => new Date(2026, 8, 28 - n, 9, 0).toISOString();

teste('Regras: diferença de dias e slug de etapa', () => {
  igual(diferencaDias('2026-09-25', '2026-09-28'), 3);
  igual(diferencaDias('2026-09-28', '2026-09-25'), -3);
  igual(diferencaDias('2026-02-28', '2026-03-01'), 1);
  igual(slugEtapa('Mensagem enviada'), 'mensagem-enviada');
  igual(slugEtapa('Reunião marcada'), 'reuniao-marcada');
});

teste('Regras: dias na etapa e "parado"', () => {
  igual(diasNaEtapa({ movido_em: diasAtras(0) }, AGORA), 0);
  igual(diasNaEtapa({ movido_em: diasAtras(10) }, AGORA), 10);
  verdadeiro(estaParado({ etapa: 'Novo', movido_em: diasAtras(DIAS_PARADO) }, AGORA), 'no limite');
  falso(estaParado({ etapa: 'Novo', movido_em: diasAtras(DIAS_PARADO - 1) }, AGORA), 'antes do limite');
  falso(estaParado({ etapa: 'Fechado', movido_em: diasAtras(90) }, AGORA), 'etapa final nunca fica parada');
});

teste('Regras: situação do follow-up', () => {
  igualProfundo(situacaoFollowUp({ etapa: 'Novo', follow_up_em: '2026-09-25' }, AGORA), { tipo: 'atrasado', dias: 3 });
  igualProfundo(situacaoFollowUp({ etapa: 'Novo', follow_up_em: '2026-09-28' }, AGORA), { tipo: 'hoje', dias: 0 });
  igualProfundo(situacaoFollowUp({ etapa: 'Novo', follow_up_em: '2026-10-02' }, AGORA), { tipo: 'futuro', dias: 4 });
  igual(situacaoFollowUp({ etapa: 'Novo', follow_up_em: null }, AGORA), null);
  igual(situacaoFollowUp({ etapa: 'Perdido', follow_up_em: '2026-01-01' }, AGORA), null, 'final sem alerta');
});

const L = (id, extra) => ({ id, nome: `L${id}`, telefone: '5511900000000', segmento: 'S', etapa: 'Novo', movido_em: diasAtras(0), ...extra });

teste('Regras: filtros de busca, segmento, serviço e situação', () => {
  const leads = [
    L(1, { nome: 'Clínica Sorriso', segmento: 'Clínica odontológica', servico: 'Landing page', follow_up_em: '2026-09-20' }),
    L(2, { responsavel: 'Mariana', segmento: 'Petshop', cnpj: '11222333000181', follow_up_em: '2026-09-28' }),
    L(3, { segmento: 'petshop', telefone: '5521987654321', movido_em: diasAtras(20) }),
  ];
  const ids = (r) => r.map((l) => l.id);
  igualProfundo(ids(filtrarLeads(leads, { busca: 'clinica' }, AGORA)), [1], 'nome sem acento');
  igualProfundo(ids(filtrarLeads(leads, { busca: 'mari' }, AGORA)), [2], 'responsável');
  igualProfundo(ids(filtrarLeads(leads, { busca: '222.333' }, AGORA)), [2], 'CNPJ parcial');
  igualProfundo(ids(filtrarLeads(leads, { busca: '98765' }, AGORA)), [3], 'telefone parcial');
  igualProfundo(ids(filtrarLeads(leads, { segmento: 'Petshop' }, AGORA)), [2, 3], 'segmento ignora maiúsculas');
  igualProfundo(ids(filtrarLeads(leads, { servico: 'Landing page' }, AGORA)), [1]);
  igualProfundo(ids(filtrarLeads(leads, { situacao: 'atrasados' }, AGORA)), [1]);
  igualProfundo(ids(filtrarLeads(leads, { situacao: 'hoje' }, AGORA)), [2]);
  igualProfundo(ids(filtrarLeads(leads, { situacao: 'parados' }, AGORA)), [3]);
  igualProfundo(ids(filtrarLeads(leads, {}, AGORA)), [1, 2, 3], 'sem filtro');
});

teste('Regras: ordenação por prioridade', () => {
  const leads = [
    L(1, { movido_em: diasAtras(1) }),
    L(2, { follow_up_em: '2026-10-05' }),
    L(3, { follow_up_em: '2026-09-27' }),
    L(4, { follow_up_em: '2026-09-28' }),
    L(5, { follow_up_em: '2026-09-01' }),
    L(6, { movido_em: diasAtras(30) }),
    L(7, { follow_up_em: '2026-10-01' }),
  ];
  igualProfundo(ordenarPorPrioridade(leads, AGORA).map((l) => l.id), [5, 3, 4, 7, 2, 6, 1]);
});

teste('Regras: resumo por etapa e contagem de situações', () => {
  const leads = [
    L(1, { follow_up_em: '2026-09-01' }),
    L(2, { movido_em: diasAtras(15) }),
    L(3, { etapa: 'Fechado', movido_em: diasAtras(40), follow_up_em: '2026-09-01' }),
    L(4, { etapa: 'Respondeu', follow_up_em: '2026-09-28' }),
  ];
  const r = resumoPorEtapa(leads, AGORA);
  igualProfundo(r['Novo'], { total: 2, parados: 1, atrasados: 1 });
  igualProfundo(r['Fechado'], { total: 1, parados: 0, atrasados: 0 });
  igualProfundo(r['Perdido'], { total: 0, parados: 0, atrasados: 0 });
  igualProfundo(contarSituacoes(leads, AGORA), { atrasados: 1, hoje: 1, parados: 1 });
});

teste('Regras: inicial e cor do avatar', () => {
  igual(inicial('  ótica Visão'), 'Ó');
  igual(inicial('123 Pet'), '1');
  igual(inicial(''), '?');
  igual(matizDoNome('Empresa A'), matizDoNome('Empresa A'), 'estável');
  verdadeiro(matizDoNome('Empresa A') >= 0 && matizDoNome('Empresa A') < 360, 'faixa 0–359');
});
