// Visão em lista (tabela) dos leads filtrados.
import { formatarTelefone, formatarCnpj, formatarDataBr } from './validators.js';
import { ordenarPorPrioridade, situacaoFollowUp, diasNaEtapa, slugEtapa } from './regras.js';
import { escapeHtml } from './ui.js';

export function criarLista(el, { onAbrir, onEnviar, nomeDoVendedor = () => '' }) {
  el.addEventListener('click', (ev) => {
    const enviar = ev.target.closest('[data-enviar]');
    if (enviar) return onEnviar(enviar.dataset.enviar);
    const linha = ev.target.closest('[data-abrir]');
    if (linha) onAbrir(linha.dataset.abrir);
  });

  function render(leads, agora = new Date()) {
    const linhas = ordenarPorPrioridade(leads, agora).map((l) => {
      const fu = situacaoFollowUp(l, agora);
      const vencido = fu?.tipo === 'atrasado';
      const traco = '<span class="text-body-secondary">—</span>';
      return `
        <tr>
          <td class="col-nome">
            <div class="fw-semibold">${escapeHtml(l.nome)}</div>
            ${l.responsavel ? `<div class="small text-body-secondary">${escapeHtml(l.responsavel)}</div>` : ''}
          </td>
          <td>${escapeHtml(l.segmento)}</td>
          <td>${nomeDoVendedor(l.vendedor_id) ? escapeHtml(nomeDoVendedor(l.vendedor_id)) : traco}</td>
          <td>${l.servico ? `<span class="tag tag-servico">${escapeHtml(l.servico)}</span>` : traco}</td>
          <td>${escapeHtml(formatarTelefone(l.telefone))}</td>
          <td>${l.cnpj ? escapeHtml(formatarCnpj(l.cnpj)) : traco}</td>
          <td><span class="etapa-pilula" data-etapa-cor="${slugEtapa(l.etapa)}">${escapeHtml(l.etapa)}</span></td>
          <td>${diasNaEtapa(l, agora)}d</td>
          <td class="${vencido ? 'texto-atraso' : ''}">
            ${l.follow_up_em ? `${vencido ? '<i class="bi bi-exclamation-triangle me-1" aria-label="Atrasado"></i>' : ''}${formatarDataBr(l.follow_up_em)}` : traco}
          </td>
          <td class="text-end">
            <button type="button" class="btn btn-sm btn-whats me-1" data-enviar="${l.id}" title="Mensagem pronta no WhatsApp"
                    aria-label="Enviar WhatsApp para ${escapeHtml(l.nome)}"><i class="bi bi-whatsapp" aria-hidden="true"></i></button>
            <button type="button" class="btn btn-sm btn-outline-primary" data-abrir="${l.id}">
              <i class="bi bi-pencil me-1" aria-hidden="true"></i>Abrir
            </button>
          </td>
        </tr>`;
    }).join('');

    el.innerHTML = `
      <div class="table-responsive">
        <table class="table table-hover mb-0 tabela-leads">
          <thead>
            <tr>
              <th scope="col">Empresa</th><th scope="col">Segmento</th><th scope="col">Vendedor</th><th scope="col">Serviço</th>
              <th scope="col">Telefone</th><th scope="col">CNPJ</th><th scope="col">Etapa</th>
              <th scope="col" title="Dias na etapa atual">Na etapa</th><th scope="col">Follow-up</th>
              <th scope="col"><span class="visually-hidden">Ações</span></th>
            </tr>
          </thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
  }

  return { render };
}
