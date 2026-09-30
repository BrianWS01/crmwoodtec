// Visão "Resultados": números do período, funil, canais, segmentos e desempenho da equipe.
import { calcularMetricas } from './metricas.js';
import { slugEtapa } from './regras.js';
import { formatarDataBr } from './validators.js';
import { escapeHtml } from './ui.js';

const PERIODOS = [[7, '7 dias'], [30, '30 dias'], [90, '90 dias'], [0, 'Tudo']];

/** carregarEnvios(dias) -> Promise<historico de envios> */
export function criarPainel(el, { carregarEnvios }) {
  let dias = 30;
  let ultimo = null;

  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-periodo]');
    if (!b) return;
    dias = Number(b.dataset.periodo);
    if (ultimo) render(ultimo.leads, ultimo.membros);
  });

  async function render(leads, membros) {
    ultimo = { leads, membros };
    const periodo = dias;
    let historico = [];
    try {
      historico = await carregarEnvios(periodo || null);
    } catch (erro) {
      console.error('[Painel]', erro);
    }
    if (periodo !== dias) return; // o usuário trocou de período enquanto carregava
    const m = calcularMetricas({ leads, historico, membros, dias: periodo || null });
    el.innerHTML = html(m, periodo);
  }

  return { render };
}

function kpi(rotulo, valor, detalhe = '', dica = '') {
  return `
    <div class="kpi" ${dica ? `title="${escapeHtml(dica)}"` : ''}>
      <span class="kpi-rotulo">${escapeHtml(rotulo)}</span>
      <span class="kpi-valor">${valor}</span>
      ${detalhe ? `<span class="kpi-detalhe">${detalhe}</span>` : ''}
    </div>`;
}

/** Barras horizontais de uma série só (quantidade), com o número escrito ao lado. */
function barras(itens, { rotulo, valor, extra = () => '', cor = () => '' }) {
  const max = Math.max(1, ...itens.map(valor));
  return `
    <ul class="barras list-unstyled mb-0">
      ${itens.map((i) => `
        <li class="barra-linha" title="${escapeHtml(rotulo(i))}: ${valor(i)}">
          <span class="barra-rotulo">${escapeHtml(rotulo(i))}</span>
          <span class="barra-trilho"><span class="barra" ${cor(i)} style="width:${(valor(i) / max) * 100}%"></span></span>
          <span class="barra-valor">${valor(i)}</span>
          <span class="barra-extra">${extra(i)}</span>
        </li>`).join('')}
    </ul>`;
}

function tabelaGrupo(titulo, grupos, vazio) {
  if (!grupos.length) return `<div class="bloco-painel"><h2 class="bloco-titulo">${titulo}</h2><p class="text-body-secondary small mb-0">${vazio}</p></div>`;
  return `
    <div class="bloco-painel">
      <h2 class="bloco-titulo">${titulo}</h2>
      ${barras(grupos.slice(0, 8), {
        rotulo: (g) => g.nome,
        valor: (g) => g.total,
        extra: (g) => (g.taxa === null ? '' : `${g.fechados} fechado${g.fechados === 1 ? '' : 's'} · ${g.taxa}%`),
      })}
      ${grupos.length > 8 ? `<p class="small text-body-secondary mt-2 mb-0">+ ${grupos.length - 8} outros</p>` : ''}
    </div>`;
}

function html(m, periodo) {
  const textoPeriodo = m.desde ? `desde ${formatarDataBr(m.desde)}` : 'desde o início';
  return `
    <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <div class="btn-group btn-group-sm" role="group" aria-label="Período">
        ${PERIODOS.map(([d, r]) => `<button type="button" class="btn ${d === periodo ? 'btn-primary' : 'btn-outline-secondary'}" data-periodo="${d}">${r}</button>`).join('')}
      </div>
      <span class="small text-body-secondary">Números ${textoPeriodo}</span>
    </div>

    <div class="kpis mb-3">
      ${kpi('Leads novos', m.novos, '', 'Cadastrados no período')}
      ${kpi('Mensagens enviadas', m.envios, '', 'Envios registrados pelo CRM no período')}
      ${kpi('Fechados', m.fechados, m.perdidos ? `${m.perdidos} perdido${m.perdidos === 1 ? '' : 's'}` : '', 'Leads que chegaram em Fechado no período')}
      ${kpi('Conversão', m.conversao === null ? '—' : `${m.conversao}%`, 'fechados ÷ (fechados + perdidos)', 'Dos leads decididos no período, quantos % foram fechados')}
      ${kpi('Ciclo médio', m.cicloMedio === null ? '—' : `${m.cicloMedio} dia${m.cicloMedio === 1 ? '' : 's'}`, 'do cadastro ao fechamento')}
      ${kpi('Em negociação', m.ativos, 'leads ativos agora')}
    </div>

    <div class="grade-painel">
      <div class="bloco-painel">
        <h2 class="bloco-titulo">Funil agora</h2>
        ${barras(m.funil, {
          rotulo: (f) => f.etapa,
          valor: (f) => f.total,
          cor: (f) => `data-etapa-cor="${slugEtapa(f.etapa)}"`,
        })}
      </div>
      <div class="bloco-painel">
        <h2 class="bloco-titulo">Equipe no período</h2>
        ${m.porMembro.length ? `
          <table class="table table-sm mb-0 tabela-equipe">
            <thead><tr><th>Vendedor</th><th class="text-end">Mensagens</th><th class="text-end">Fechados</th></tr></thead>
            <tbody>${m.porMembro.map((p) => `<tr><td>${escapeHtml(p.nome)}</td><td class="text-end">${p.envios}</td><td class="text-end">${p.fechados}</td></tr>`).join('')}</tbody>
          </table>` : '<p class="text-body-secondary small mb-0">Sem atividade no período.</p>'}
      </div>
      ${tabelaGrupo('Leads por origem', m.porOrigem, 'Nenhum lead cadastrado no período.')}
      ${tabelaGrupo('Leads por segmento', m.porSegmento, 'Nenhum lead cadastrado no período.')}
    </div>`;
}
