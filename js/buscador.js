// Tela do buscador de leads: configura a chave do Google, busca, filtra e manda os escolhidos para o CRM.
import {
  NICHOS, nichoDoTexto, buscarLugares, marcarExistentes, filtrarResultados, podeAdicionar, leadDoResultado,
} from './busca-leads.js';
import { formatarTelefone } from './validators.js';
import { escapeHtml, toast, carregando } from './ui.js';

const CHAVE_CONFIG = 'google_places_key';
const CHAVE_CIDADE = 'crm-busca-cidade';
const MAX_PAGINAS = 3; // o Google entrega no máximo 60 resultados (3 páginas de 20) por busca

/**
 * dependencias:
 *   leads(), membros(), usuarioId()
 *   lerConfig(chave), salvarConfig(chave, valor)
 *   gravar(leads, onProgresso) -> { criados, falhas }
 *   onAdicionados(criados)
 */
export function criarBuscador({ leads, membros, usuarioId, lerConfig, salvarConfig, gravar, onAdicionados }) {
  const el = {
    modal: document.getElementById('modal-buscador'),
    corpo: document.getElementById('buscador-corpo'),
    rodape: document.getElementById('buscador-rodape'),
  };
  const modal = new bootstrap.Modal(el.modal);
  const st = {
    chave: null,
    texto: '',
    cidade: lerLocal(CHAVE_CIDADE) ?? '',
    resultados: [],
    selecionados: new Set(),
    proximaPagina: null,
    paginas: 0,
    buscando: false,
    filtros: { semSite: false, soCelular: false, esconderNoCrm: true },
  };

  async function abrir() {
    modal.show();
    if (st.chave) return telaBusca();
    el.corpo.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div></div>';
    el.rodape.innerHTML = '';
    try {
      st.chave = await lerConfig(CHAVE_CONFIG);
    } catch (erro) {
      console.error('[Buscador]', erro);
      el.corpo.innerHTML = '<div class="alert alert-warning">Não foi possível ler a configuração. Rode o <code>supabase/schema.sql</code> atualizado no SQL Editor do Supabase.</div>';
      return;
    }
    if (st.chave) telaBusca();
    else telaChave();
  }

  // ---------------------------------------------------------------
  // Configuração da chave
  // ---------------------------------------------------------------
  function telaChave() {
    el.corpo.innerHTML = `
      <div class="row g-4">
        <div class="col-12 col-lg-7">
          <h3 class="h6 fw-bold">Configurar uma vez (5 minutos)</h3>
          <ol class="small ps-3">
            <li>Entre em <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">console.cloud.google.com</a> com sua conta Google e crie um projeto (ex.: "CRM WoodTec").</li>
            <li>Em <b>Faturamento</b>, vincule um cartão. O Google dá uma cota gratuita todo mês; confira os valores atuais em
              <a href="https://mapsplatform.google.com/pricing/" target="_blank" rel="noopener">mapsplatform.google.com/pricing</a>
              e crie um <b>alerta de orçamento</b> (ex.: R$ 20) para nunca ter surpresa.</li>
            <li>Em <b>APIs e serviços → Biblioteca</b>, procure <b>Places API (New)</b> e clique em <b>Ativar</b>.</li>
            <li>Em <b>APIs e serviços → Credenciais → Criar credenciais → Chave de API</b>.</li>
            <li>Na chave criada, em <b>Restrições</b>:
              <ul>
                <li><b>Restrição de aplicativo:</b> Sites (referenciadores HTTP) e adicione
                  <code>https://crmwoodtec-rho.vercel.app/*</code> e <code>http://localhost:5500/*</code></li>
                <li><b>Restrição de API:</b> só <b>Places API (New)</b></li>
              </ul>
            </li>
            <li>Copie a chave e cole ao lado.</li>
          </ol>
        </div>
        <div class="col-12 col-lg-5">
          <form id="form-chave" class="card card-body" novalidate>
            <label for="chave-google" class="form-label fw-semibold">Chave da API do Google</label>
            <input type="text" id="chave-google" class="form-control font-monospace" placeholder="AIza..." autocomplete="off" required>
            <div class="form-text mb-3">Fica salva no Supabase e vale para a equipe toda. Só membros do CRM conseguem ler.</div>
            <button type="submit" class="btn btn-primary" id="salvar-chave"><i class="bi bi-check-lg me-1" aria-hidden="true"></i>Salvar e testar</button>
            <div id="chave-erro" class="alert alert-danger small mt-3 mb-0 d-none"></div>
          </form>
        </div>
      </div>`;
    el.rodape.innerHTML = '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Fechar</button>';

    const form = el.corpo.querySelector('#form-chave');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const chave = form.querySelector('#chave-google').value.trim();
      const erroEl = form.querySelector('#chave-erro');
      erroEl.classList.add('d-none');
      if (!chave) return form.querySelector('#chave-google').focus();
      const restaurar = carregando(form.querySelector('#salvar-chave'), 'Testando...');
      try {
        await buscarLugares({ chave, texto: 'dentista em São Paulo' }); // testa antes de salvar
        await salvarConfig(CHAVE_CONFIG, chave);
        st.chave = chave;
        toast('Chave salva. Pode buscar!', 'sucesso');
        telaBusca();
      } catch (erro) {
        erroEl.textContent = erro.message;
        erroEl.classList.remove('d-none');
        restaurar();
      }
    });
  }

  // ---------------------------------------------------------------
  // Busca
  // ---------------------------------------------------------------
  function telaBusca() {
    el.corpo.innerHTML = `
      <form id="form-busca" class="row g-2 align-items-end mb-3" novalidate>
        <div class="col-12 col-md-5">
          <label for="busca-texto" class="form-label small fw-semibold">O que buscar</label>
          <input type="text" id="busca-texto" class="form-control" list="lista-nichos" required
                 placeholder="Escolha um nicho ou digite (ex.: dentista)" value="${escapeHtml(st.texto)}">
          <datalist id="lista-nichos">${NICHOS.map((n) => `<option value="${escapeHtml(n.rotulo)}"></option>`).join('')}</datalist>
        </div>
        <div class="col-12 col-md-4">
          <label for="busca-cidade" class="form-label small fw-semibold">Onde</label>
          <input type="text" id="busca-cidade" class="form-control" required
                 placeholder="Cidade ou bairro (ex.: Jundiaí SP)" value="${escapeHtml(st.cidade)}">
        </div>
        <div class="col-12 col-md-3 d-grid">
          <button type="submit" class="btn btn-primary" id="btn-buscar"><i class="bi bi-search me-1" aria-hidden="true"></i>Buscar</button>
        </div>
      </form>
      <div id="busca-resultados">
        <div class="text-center text-body-secondary py-5">
          <i class="bi bi-binoculars fs-1 d-block mb-2" aria-hidden="true"></i>
          Escolha o nicho e a cidade. O CRM mostra quem <b>não tem site</b> e quem tem <b>celular</b> (WhatsApp).
        </div>
      </div>
      <p class="small text-body-secondary mt-2 mb-0">
        Dados públicos do Google Maps. <button type="button" class="btn btn-link btn-sm p-0 align-baseline" id="trocar-chave">Trocar chave do Google</button>
      </p>`;

    el.corpo.querySelector('#form-busca').addEventListener('submit', (ev) => { ev.preventDefault(); novaBusca(); });
    el.corpo.querySelector('#trocar-chave').addEventListener('click', telaChave);
    if (st.resultados.length) renderResultados();
    else el.rodape.innerHTML = '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Fechar</button>';
    setTimeout(() => el.corpo.querySelector(st.texto ? '#busca-cidade' : '#busca-texto')?.focus(), 300);
  }

  async function novaBusca() {
    const texto = el.corpo.querySelector('#busca-texto').value.trim();
    const cidade = el.corpo.querySelector('#busca-cidade').value.trim();
    if (!texto || !cidade) {
      el.corpo.querySelector(texto ? '#busca-cidade' : '#busca-texto').focus();
      return;
    }
    st.texto = texto;
    st.cidade = cidade;
    salvarLocal(CHAVE_CIDADE, cidade);
    st.resultados = [];
    st.selecionados.clear();
    st.proximaPagina = null;
    st.paginas = 0;
    await carregarPagina();
  }

  function termoDeBusca() {
    const nicho = nichoDoTexto(st.texto);
    return `${nicho?.busca ?? st.texto} em ${st.cidade}`;
  }

  async function carregarPagina() {
    if (st.buscando) return;
    st.buscando = true;
    const botao = el.corpo.querySelector('#btn-buscar');
    const restaurar = botao ? carregando(botao, 'Buscando...') : () => {};
    if (!st.resultados.length) {
      el.corpo.querySelector('#busca-resultados').innerHTML =
        '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-2 mb-0">Procurando no Google...</p></div>';
    }
    try {
      const { lugares, proximaPagina } = await buscarLugares({ chave: st.chave, texto: termoDeBusca(), proximaPagina: st.proximaPagina });
      const antes = new Set(st.resultados.map((r) => r.googleId));
      st.resultados = marcarExistentes([...st.resultados, ...lugares], leads());
      st.proximaPagina = st.paginas + 1 < MAX_PAGINAS ? proximaPagina : null;
      st.paginas += 1;
      // Já deixa marcado quem é o alvo principal: sem site próprio e dá para cadastrar
      for (const r of st.resultados) {
        if (!antes.has(r.googleId) && podeAdicionar(r) && !r.temSite) st.selecionados.add(r.googleId);
      }
      renderResultados();
    } catch (erro) {
      el.corpo.querySelector('#busca-resultados').innerHTML = `<div class="alert alert-danger">${escapeHtml(erro.message)}</div>`;
    } finally {
      st.buscando = false;
      restaurar();
    }
  }

  function renderResultados() {
    const alvo = el.corpo.querySelector('#busca-resultados');
    const visiveis = filtrarResultados(st.resultados, st.filtros);
    const ativos = st.resultados.filter((r) => !r.fechado);
    const semSite = ativos.filter((r) => !r.temSite).length;
    const celular = ativos.filter((r) => r.tipoTelefone === 'celular').length;
    const noCrm = ativos.filter((r) => r.noCrm).length;
    const marcados = st.resultados.filter((r) => st.selecionados.has(r.googleId) && podeAdicionar(r));

    const chk = (id, campo, rotulo) => `
      <div class="form-check form-check-inline mb-0">
        <input class="form-check-input" type="checkbox" id="${id}" data-filtro="${campo}" ${st.filtros[campo] ? 'checked' : ''}>
        <label class="form-check-label small" for="${id}">${rotulo}</label>
      </div>`;

    alvo.innerHTML = `
      <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        <span class="fw-semibold">${ativos.length} encontrados</span>
        <span class="badge text-bg-success">${semSite} sem site</span>
        <span class="badge text-bg-primary">${celular} com celular</span>
        ${noCrm ? `<span class="badge text-bg-secondary">${noCrm} já no CRM</span>` : ''}
      </div>
      <div class="d-flex flex-wrap align-items-center gap-3 mb-2">
        ${chk('f-sem-site', 'semSite', 'Só sem site')}
        ${chk('f-celular', 'soCelular', 'Só celular (WhatsApp)')}
        ${chk('f-crm', 'esconderNoCrm', 'Esconder quem já está no CRM')}
        <span class="ms-auto small">
          <button type="button" class="btn btn-link btn-sm p-0" data-marcar="todos">Marcar todos</button> ·
          <button type="button" class="btn btn-link btn-sm p-0" data-marcar="nenhum">Desmarcar</button>
        </span>
      </div>
      ${visiveis.length ? `
        <div class="lista-busca">
          ${visiveis.map((r) => itemHtml(r)).join('')}
        </div>` : '<p class="text-body-secondary text-center py-4 mb-0">Nenhum resultado com esses filtros.</p>'}
      ${st.proximaPagina ? `<div class="text-center mt-3"><button type="button" class="btn btn-outline-primary btn-sm" id="mais-resultados">
        <i class="bi bi-plus-lg me-1" aria-hidden="true"></i>Carregar mais resultados</button></div>` : ''}
      ${!st.proximaPagina && st.paginas >= MAX_PAGINAS ? '<p class="small text-body-secondary text-center mt-3 mb-0">O Google mostra até 60 por busca. Para achar mais, busque por bairro ou cidade vizinha.</p>' : ''}`;

    alvo.querySelectorAll('[data-filtro]').forEach((c) => c.addEventListener('change', () => {
      st.filtros[c.dataset.filtro] = c.checked;
      renderResultados();
    }));
    alvo.querySelectorAll('[data-marcar]').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.marcar === 'todos') visiveis.filter(podeAdicionar).forEach((r) => st.selecionados.add(r.googleId));
      else st.selecionados.clear();
      renderResultados();
    }));
    alvo.querySelectorAll('[data-selecionar]').forEach((c) => c.addEventListener('change', () => {
      if (c.checked) st.selecionados.add(c.dataset.selecionar);
      else st.selecionados.delete(c.dataset.selecionar);
      renderRodape();
    }));
    alvo.querySelector('#mais-resultados')?.addEventListener('click', carregarPagina);
    renderRodape(marcados.length);
  }

  function itemHtml(r) {
    const pode = podeAdicionar(r);
    const telefone = r.telefone
      ? `<span><i class="bi bi-telephone" aria-hidden="true"></i> ${escapeHtml(formatarTelefone(r.telefone))}</span>
         <span class="badge ${r.tipoTelefone === 'celular' ? 'text-bg-primary' : 'text-bg-secondary'}">${r.tipoTelefone === 'celular' ? 'Celular' : 'Fixo'}</span>`
      : '<span class="text-danger-emphasis">Sem telefone</span>';
    const site = r.temSite
      ? `<a href="${escapeHtml(r.site)}" target="_blank" rel="noopener" class="small">Tem site <i class="bi bi-box-arrow-up-right" aria-hidden="true"></i></a>`
      : `<span class="badge text-bg-success">Sem site${r.site ? ' próprio' : ''}</span>`;
    return `
      <label class="item-busca ${pode ? '' : 'item-busca-off'}">
        <input type="checkbox" class="form-check-input mt-1" data-selecionar="${escapeHtml(r.googleId)}"
               ${pode && st.selecionados.has(r.googleId) ? 'checked' : ''} ${pode ? '' : 'disabled'}
               aria-label="Selecionar ${escapeHtml(r.nome)}">
        <div class="flex-grow-1 min-w-0">
          <div class="d-flex flex-wrap align-items-center gap-2">
            <span class="fw-semibold">${escapeHtml(r.nome)}</span>
            ${site}
            ${r.noCrm ? `<span class="badge text-bg-secondary">Já no CRM: ${escapeHtml(r.noCrm)}</span>` : ''}
          </div>
          <div class="item-meta">
            ${telefone}
            ${r.nota ? `<span title="${r.avaliacoes} avaliações no Google"><i class="bi bi-star-fill text-warning" aria-hidden="true"></i> ${r.nota} (${r.avaliacoes})</span>` : ''}
            ${r.categoria ? `<span>${escapeHtml(r.categoria)}</span>` : ''}
            ${r.mapsUrl ? `<a href="${escapeHtml(r.mapsUrl)}" target="_blank" rel="noopener">Ver no Maps</a>` : ''}
          </div>
          ${r.endereco ? `<div class="small text-body-secondary text-truncate">${escapeHtml(r.endereco)}</div>` : ''}
        </div>
      </label>`;
  }

  function renderRodape() {
    const marcados = st.resultados.filter((r) => st.selecionados.has(r.googleId) && podeAdicionar(r));
    const nicho = nichoDoTexto(st.texto);
    const segmentoAtual = el.rodape.querySelector('#busca-segmento')?.value;
    const vendedorAtual = el.rodape.querySelector('#busca-vendedor')?.value ?? usuarioId();
    el.rodape.innerHTML = `
      <div class="d-flex flex-wrap align-items-end gap-2 w-100">
        <div>
          <label for="busca-segmento" class="form-label small mb-1">Segmento no CRM</label>
          <input type="text" id="busca-segmento" class="form-control form-control-sm" list="lista-segmentos"
                 value="${escapeHtml(segmentoAtual ?? nicho?.segmento ?? primeiraMaiuscula(st.texto))}">
        </div>
        ${membros().length > 1 ? `<div>
          <label for="busca-vendedor" class="form-label small mb-1">Vendedor</label>
          <select id="busca-vendedor" class="form-select form-select-sm">
            ${membros().map((m) => `<option value="${m.user_id}" ${m.user_id === vendedorAtual ? 'selected' : ''}>${escapeHtml(m.nome)}</option>`).join('')}
          </select>
        </div>` : ''}
        <button type="button" class="btn btn-outline-secondary ms-auto" data-bs-dismiss="modal">Fechar</button>
        <button type="button" class="btn btn-success" id="btn-adicionar" ${marcados.length ? '' : 'disabled'}>
          <i class="bi bi-plus-lg me-1" aria-hidden="true"></i>Adicionar ${marcados.length} ao CRM
        </button>
      </div>`;
    el.rodape.querySelector('#btn-adicionar').addEventListener('click', () => adicionar(marcados));
  }

  async function adicionar(marcados) {
    const segmento = el.rodape.querySelector('#busca-segmento').value.trim();
    if (!segmento) {
      el.rodape.querySelector('#busca-segmento').focus();
      return;
    }
    const vendedor_id = el.rodape.querySelector('#busca-vendedor')?.value ?? usuarioId();
    const restaurar = carregando(el.rodape.querySelector('#btn-adicionar'), 'Adicionando...');
    try {
      const { criados, falhas } = await gravar(marcados.map((r) => leadDoResultado(r, { segmento, vendedor_id })));
      onAdicionados(criados);
      st.resultados = marcarExistentes(st.resultados, leads());
      st.selecionados.clear();
      renderResultados();
      toast(`${criados.length} lead${criados.length === 1 ? '' : 's'} adicionado${criados.length === 1 ? '' : 's'}. Estão em Hoje → Novos para abordar.`
        + (falhas.length ? ` ${falhas.length} não entraram (telefone já cadastrado).` : ''), falhas.length ? 'aviso' : 'sucesso');
    } catch (erro) {
      toast(`Não foi possível adicionar: ${erro.message}`, 'erro');
      restaurar();
    }
  }

  return { abrir };
}

function primeiraMaiuscula(t) {
  const s = String(t ?? '').trim();
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

function lerLocal(chave) {
  try { return localStorage.getItem(chave); } catch { return null; }
}

function salvarLocal(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch { /* sem persistência */ }
}
