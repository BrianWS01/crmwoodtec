// Visão "Hoje": a fila de quem precisa de contato agora, em grupos, com ação de um clique.
import { formatarTelefone, formatarDataBr, hojeIso } from './validators.js';
import { montarFila, totalFila, situacaoFollowUp, diasNaEtapa, sugerirPerdido, slugEtapa } from './regras.js';
import { saudacao, primeiroNome } from './mensagens.js';
import { escapeHtml } from './ui.js';

const GRUPOS = [
  { chave: 'atrasados', titulo: 'Atrasados', icone: 'bi-exclamation-triangle', classe: 'grupo-atraso',
    dica: 'O follow-up já venceu. Comece por aqui.' },
  { chave: 'hoje', titulo: 'Retornos de hoje', icone: 'bi-bell', classe: 'grupo-hoje',
    dica: 'Follow-ups marcados para hoje.' },
  { chave: 'novos', titulo: 'Novos para abordar', icone: 'bi-person-plus', classe: 'grupo-novo',
    dica: 'Ainda não receberam nenhuma mensagem.' },
  { chave: 'esquecidos', titulo: 'Esquecidos', icone: 'bi-hourglass-split', classe: 'grupo-esquecido',
    dica: 'Parados há 7 dias ou mais e sem retorno agendado.' },
];

// Quantos cards mostrar por grupo antes do "ver todos"
const LIMITE = 12;

/**
 * callbacks:
 *   onAbrir(id)            abre o lead
 *   onEnviar(id)           abre o envio de WhatsApp
 *   onAdiar(id, dataIso)   muda o follow-up
 *   onMover(id, etapa)     muda a etapa (ex.: Perdido, Respondeu)
 */
export function criarFila(el, { onAbrir, onEnviar, onAdiar, onMover }) {
  const expandidos = new Set();

  el.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-acao]');
    if (!b) return;
    const id = b.closest('[data-id]')?.dataset.id;
    const acao = b.dataset.acao;
    if (acao === 'ver-todos') {
      expandidos.add(b.dataset.grupo);
      b.dispatchEvent(new CustomEvent('fila:rerender', { bubbles: true }));
      return;
    }
    if (!id) return;
    if (acao === 'abrir') onAbrir(id);
    if (acao === 'enviar') onEnviar(id);
    if (acao === 'respondeu') onMover(id, 'Respondeu');
    if (acao === 'perdido') onMover(id, 'Perdido');
    if (acao === 'adiar') onAdiar(id, b.dataset.data);
  });

  function render(leads, { nomeUsuario = '', nomeDoVendedor = () => '', agora = new Date() } = {}) {
    const fila = montarFila(leads, agora);
    const total = totalFila(fila);
    const hoje = hojeIso(agora);
    const amanha = hojeIso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1));
    const em3 = hojeIso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 3));
    const em7 = hojeIso(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 7));

    const partes = [];
    if (fila.atrasados.length) partes.push(`<b>${fila.atrasados.length}</b> atrasado${fila.atrasados.length > 1 ? 's' : ''}`);
    if (fila.hoje.length) partes.push(`<b>${fila.hoje.length}</b> retorno${fila.hoje.length > 1 ? 's' : ''} de hoje`);
    if (fila.novos.length) partes.push(`<b>${fila.novos.length}</b> novo${fila.novos.length > 1 ? 's' : ''} para abordar`);
    if (fila.esquecidos.length) partes.push(`<b>${fila.esquecidos.length}</b> esquecido${fila.esquecidos.length > 1 ? 's' : ''}`);

    const banner = `
      <div class="banner-dia mb-3">
        <div>
          <p class="h5 fw-bold mb-1">${escapeHtml(saudacao(agora))}${nomeUsuario ? `, ${escapeHtml(primeiroNome(nomeUsuario))}` : ''}!</p>
          <p class="mb-0 text-body-secondary">${total
            ? `Hoje você tem ${juntar(partes)}.`
            : 'Nada pendente para hoje. Todos os leads ativos têm retorno agendado. 🎉'}</p>
        </div>
      </div>`;

    const grupos = GRUPOS.filter((g) => fila[g.chave].length).map((g) => {
      const itens = fila[g.chave];
      const mostrar = expandidos.has(g.chave) ? itens : itens.slice(0, LIMITE);
      return `
        <section class="grupo-fila ${g.classe}" aria-label="${escapeHtml(g.titulo)}">
          <header class="grupo-cabecalho">
            <i class="bi ${g.icone}" aria-hidden="true"></i>
            <h2 class="grupo-titulo">${escapeHtml(g.titulo)}</h2>
            <span class="coluna-contador">${itens.length}</span>
            <span class="small text-body-secondary d-none d-md-inline ms-2">${escapeHtml(g.dica)}</span>
          </header>
          <div class="grupo-itens">
            ${mostrar.map((l) => itemHtml(l, { agora, hoje, amanha, em3, em7, nomeDoVendedor })).join('')}
          </div>
          ${mostrar.length < itens.length
            ? `<button type="button" class="btn btn-sm btn-link" data-acao="ver-todos" data-grupo="${g.chave}">Ver todos os ${itens.length}</button>`
            : ''}
        </section>`;
    }).join('');

    el.innerHTML = banner + grupos;
    return total;
  }

  return { render };
}

function juntar(partes) {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
}

function itemHtml(l, { agora, amanha, em3, em7, nomeDoVendedor }) {
  const fu = situacaoFollowUp(l, agora);
  const motivo = fu?.tipo === 'atrasado'
    ? `<span class="texto-atraso">Retorno era ${formatarDataBr(l.follow_up_em)} (${fu.dias} dia${fu.dias > 1 ? 's' : ''} atrás)</span>`
    : fu?.tipo === 'hoje'
      ? 'Retorno marcado para hoje'
      : l.ultimo_contato_em
        ? `Último contato ${formatarDataBr(l.ultimo_contato_em)} · ${diasNaEtapa(l, agora)} dias na etapa`
        : `Cadastrado em ${formatarDataBr(l.criado_em)}`;

  const perdido = sugerirPerdido(l);
  const vendedor = nomeDoVendedor(l.vendedor_id);
  const prospeccao = l.etapa === 'Novo' || l.etapa === 'Mensagem enviada';

  return `
    <article class="item-fila ${perdido ? 'item-perdido' : ''}" data-id="${l.id}">
      <div class="item-info">
        <button type="button" class="card-nome" data-acao="abrir">${escapeHtml(l.nome)}</button>
        <div class="item-meta">
          <span class="etapa-pilula" data-etapa-cor="${slugEtapa(l.etapa)}">${escapeHtml(l.etapa)}</span>
          <span>${escapeHtml(l.segmento)}</span>
          ${l.responsavel ? `<span><i class="bi bi-person" aria-hidden="true"></i> ${escapeHtml(l.responsavel)}</span>` : ''}
          <span><i class="bi bi-telephone" aria-hidden="true"></i> ${escapeHtml(formatarTelefone(l.telefone))}</span>
          ${vendedor ? `<span class="tag tag-vendedor" title="Vendedor">${escapeHtml(vendedor)}</span>` : ''}
          ${l.tentativas ? `<span class="tag tag-tentativas" title="Mensagens enviadas sem resposta">${l.tentativas}× sem resposta</span>` : ''}
        </div>
        <div class="item-motivo small">${motivo}</div>
        ${perdido ? `<div class="item-sugestao small"><i class="bi bi-lightbulb" aria-hidden="true"></i>
          ${l.tentativas} mensagens sem resposta. Vale marcar como perdido e focar em outro?</div>` : ''}
      </div>
      <div class="item-acoes">
        <button type="button" class="btn btn-sm btn-whats-cheio" data-acao="enviar" title="Mensagem pronta no WhatsApp">
          <i class="bi bi-whatsapp" aria-hidden="true"></i><span class="ms-1">Enviar</span>
        </button>
        ${prospeccao && l.ultimo_contato_em ? `<button type="button" class="btn btn-sm btn-outline-info" data-acao="respondeu" title="Mover para Respondeu">
          <i class="bi bi-chat-dots" aria-hidden="true"></i><span class="ms-1 d-none d-sm-inline">Respondeu</span></button>` : ''}
        <div class="dropdown">
          <button type="button" class="btn btn-sm btn-outline-secondary dropdown-toggle" data-bs-toggle="dropdown" aria-expanded="false"
                  title="Adiar o retorno">
            <i class="bi bi-calendar-plus" aria-hidden="true"></i><span class="ms-1 d-none d-sm-inline">Adiar</span>
          </button>
          <ul class="dropdown-menu dropdown-menu-end">
            <li><button type="button" class="dropdown-item" data-acao="adiar" data-data="${amanha}">Amanhã</button></li>
            <li><button type="button" class="dropdown-item" data-acao="adiar" data-data="${em3}">Daqui a 3 dias</button></li>
            <li><button type="button" class="dropdown-item" data-acao="adiar" data-data="${em7}">Daqui a 1 semana</button></li>
          </ul>
        </div>
        ${perdido || fu?.tipo === 'atrasado' ? `<button type="button" class="btn btn-sm btn-outline-danger" data-acao="perdido" title="Marcar como Perdido">
          <i class="bi bi-x-circle" aria-hidden="true"></i></button>` : ''}
      </div>
    </article>`;
}
