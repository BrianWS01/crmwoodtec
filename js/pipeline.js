// Kanban: resumo por etapa, colunas, cards e arrastar-e-soltar (SortableJS, com suporte a toque).
import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js';
import { ETAPAS } from './constants.js';
import { formatarTelefone, formatarCnpj, formatarDataBr } from './validators.js';
import {
  slugEtapa, etapaFinal, diasNaEtapa, situacaoFollowUp, estaParado, ordenarPorPrioridade,
  resumoPorEtapa, inicial, matizDoNome, DIAS_PARADO,
} from './regras.js';
import { escapeHtml } from './ui.js';

const ICONES_ETAPA = {
  'Novo': 'bi-geo-alt',
  'Mensagem enviada': 'bi-send',
  'Respondeu': 'bi-chat-dots',
  'Reunião marcada': 'bi-calendar-event',
  'Proposta enviada': 'bi-file-earmark-text',
  'Fechado': 'bi-trophy',
  'Perdido': 'bi-x-circle',
};

/**
 * Cria o pipeline dentro de `elQuadro` (colunas) e `elResumo` (blocos de contagem).
 * callbacks:
 *   onAbrir(id)             abre o lead no modal
 *   onNovo(etapa)           cadastra lead já na etapa
 *   onMover(id, etapa)      grava a mudança; o app re-renderiza (sucesso ou falha)
 */
export function criarPipeline(elQuadro, elResumo, { onAbrir, onNovo, onMover }) {
  let sortables = [];
  let arrastando = false;

  // Delegação de eventos (registrada uma vez só)
  elQuadro.addEventListener('click', (ev) => {
    if (arrastando) return;
    const novo = ev.target.closest('[data-novo]');
    if (novo) return onNovo(novo.dataset.novo);
    if (ev.target.closest('.no-drag')) return; // WhatsApp, "Mover para"
    const card = ev.target.closest('.card-lead');
    if (card) onAbrir(card.dataset.id);
  });

  elQuadro.addEventListener('change', (ev) => {
    const sel = ev.target.closest('select[data-mover]');
    if (!sel || !sel.value) return;
    const card = sel.closest('.card-lead');
    card.classList.add('salvando');
    onMover(sel.dataset.mover, sel.value);
  });

  elResumo.addEventListener('click', (ev) => {
    const bloco = ev.target.closest('[data-ir-etapa]');
    if (!bloco) return;
    const col = elQuadro.querySelector(`.coluna[data-etapa="${bloco.dataset.irEtapa}"]`);
    col?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    col?.querySelector('.coluna-titulo')?.focus({ preventScroll: true });
  });

  function render(leads, agora = new Date()) {
    renderResumo(leads, agora);
    renderQuadro(leads, agora);
  }

  function renderResumo(leads, agora) {
    const resumo = resumoPorEtapa(leads, agora);
    elResumo.innerHTML = ETAPAS.map((etapa) => {
      const r = resumo[etapa];
      const extra = r.parados && !etapaFinal(etapa)
        ? `<span class="resumo-alerta"><i class="bi bi-clock" aria-hidden="true"></i> ${r.parados} parado${r.parados > 1 ? 's' : ''}</span>`
        : '';
      return `
        <button type="button" class="resumo-bloco" data-etapa-cor="${slugEtapa(etapa)}" data-ir-etapa="${escapeHtml(etapa)}"
                title="Ir para a coluna ${escapeHtml(etapa)}">
          <span class="resumo-nome">${escapeHtml(etapa)}</span>
          <i class="bi ${ICONES_ETAPA[etapa]} resumo-icone" aria-hidden="true"></i>
          <span class="resumo-total">${r.total}</span>
          ${extra}
        </button>`;
    }).join('');
  }

  function renderQuadro(leads, agora) {
    sortables.forEach((s) => s.destroy());
    sortables = [];

    const porEtapa = Object.fromEntries(ETAPAS.map((e) => [e, []]));
    for (const l of ordenarPorPrioridade(leads, agora)) porEtapa[l.etapa]?.push(l);

    elQuadro.innerHTML = ETAPAS.map((etapa) => `
      <section class="coluna" data-etapa="${escapeHtml(etapa)}" data-etapa-cor="${slugEtapa(etapa)}"
               aria-label="Etapa ${escapeHtml(etapa)}">
        <header class="coluna-cabecalho">
          <span class="coluna-ponto" aria-hidden="true"></span>
          <h2 class="coluna-titulo" tabindex="-1">${escapeHtml(etapa)}</h2>
          <span class="coluna-contador">${porEtapa[etapa].length}</span>
          <button type="button" class="btn btn-sm btn-link coluna-novo ms-auto" data-novo="${escapeHtml(etapa)}"
                  title="Novo lead em ${escapeHtml(etapa)}" aria-label="Novo lead em ${escapeHtml(etapa)}">
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
          </button>
        </header>
        <div class="coluna-cards" data-etapa="${escapeHtml(etapa)}">
          ${porEtapa[etapa].map((l) => cardHtml(l, agora)).join('')}
        </div>
      </section>`).join('');

    elQuadro.querySelectorAll('.coluna-cards').forEach((lista) => {
      sortables.push(Sortable.create(lista, {
        group: 'pipeline',
        sort: false,                 // a ordem dentro da coluna é por prioridade
        animation: 150,
        delay: 180,                  // no toque: segurar um instante para arrastar (deixa rolar a tela)
        delayOnTouchOnly: true,
        filter: '.no-drag',
        preventOnFilter: false,
        ghostClass: 'card-fantasma',
        chosenClass: 'card-escolhido',
        dragClass: 'card-arrastado',
        onStart: () => { arrastando = true; elQuadro.classList.add('arrastando'); },
        onEnd: (ev) => {
          elQuadro.classList.remove('arrastando');
          setTimeout(() => { arrastando = false; }, 0); // evita abrir o modal pelo clique do "soltar"
          if (ev.from === ev.to) return;
          ev.item.classList.add('salvando');
          onMover(ev.item.dataset.id, ev.to.dataset.etapa);
        },
      }));
    });
  }

  return { render };
}

function cardHtml(l, agora) {
  const fu = situacaoFollowUp(l, agora);
  const dias = diasNaEtapa(l, agora);
  const parado = estaParado(l, agora);

  let alerta = '';
  if (fu?.tipo === 'atrasado') {
    alerta = `<div class="card-alerta card-alerta-atraso"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i>
      Contato atrasado há ${fu.dias} dia${fu.dias > 1 ? 's' : ''}</div>`;
  } else if (fu?.tipo === 'hoje') {
    alerta = `<div class="card-alerta card-alerta-hoje"><i class="bi bi-bell" aria-hidden="true"></i> Contato pra hoje</div>`;
  }

  const classeDias = etapaFinal(l.etapa) ? 'dias-neutro' : dias >= DIAS_PARADO * 3 ? 'dias-critico' : parado ? 'dias-alerta' : 'dias-ok';
  const tituloDias = `${dias} dia${dias === 1 ? '' : 's'} nesta etapa${parado ? ' (parado)' : ''}`;

  const linhas = [];
  if (l.responsavel) linhas.push(`<i class="bi bi-person" aria-hidden="true"></i><span>${escapeHtml(l.responsavel)}</span>`);
  linhas.push(`<i class="bi bi-telephone" aria-hidden="true"></i><span>${escapeHtml(formatarTelefone(l.telefone))}</span>`);
  if (l.cnpj) linhas.push(`<i class="bi bi-building" aria-hidden="true"></i><span>${escapeHtml(formatarCnpj(l.cnpj))}</span>`);
  if (l.follow_up_em) {
    linhas.push(`<i class="bi bi-calendar3" aria-hidden="true"></i><span class="${fu?.tipo === 'atrasado' ? 'texto-atraso' : ''}">Follow-up ${formatarDataBr(l.follow_up_em)}</span>`);
  }
  if (l.ultimo_contato_em) {
    linhas.push(`<i class="bi bi-chat-left-text" aria-hidden="true"></i><span>Último contato ${formatarDataBr(l.ultimo_contato_em)}</span>`);
  }

  const opcoesMover = ETAPAS.filter((e) => e !== l.etapa)
    .map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');

  return `
    <article class="card-lead ${fu?.tipo === 'atrasado' ? 'card-atrasado' : ''}" data-id="${l.id}">
      ${alerta}
      <div class="card-topo">
        <span class="avatar" style="--avatar-h:${matizDoNome(l.nome)}" aria-hidden="true">${escapeHtml(inicial(l.nome))}</span>
        <div class="card-titulo-bloco">
          <button type="button" class="card-nome">${escapeHtml(l.nome)}</button>
          <div class="card-tags">
            <span class="tag tag-segmento">${escapeHtml(l.segmento)}</span>
            ${l.servico ? `<span class="tag tag-servico">${escapeHtml(l.servico)}</span>` : ''}
          </div>
        </div>
      </div>
      <ul class="card-linhas">${linhas.map((h) => `<li>${h}</li>`).join('')}</ul>
      <footer class="card-rodape">
        <span class="dias ${classeDias}" title="${tituloDias}"><i class="bi bi-clock" aria-hidden="true"></i> ${dias}d</span>
        <div class="d-flex align-items-center gap-1 ms-auto">
          <a class="btn btn-sm btn-whats no-drag" href="https://wa.me/${l.telefone}" target="_blank" rel="noopener"
             title="Abrir conversa no WhatsApp" aria-label="Abrir ${escapeHtml(l.nome)} no WhatsApp">
            <i class="bi bi-whatsapp" aria-hidden="true"></i>
          </a>
          <select class="form-select form-select-sm mover-para no-drag" data-mover="${l.id}"
                  aria-label="Mover ${escapeHtml(l.nome)} para outra etapa">
            <option value="">Mover para…</option>
            ${opcoesMover}
          </select>
        </div>
      </footer>
    </article>`;
}
