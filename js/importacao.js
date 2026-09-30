// Tela de importação: arquivo -> mapeamento de colunas + prévia -> gravação em lote.
import {
  CAMPOS_IMPORTACAO, lerCsv, sugerirMapeamento, pareceCabecalho, prepararImportacao,
} from './importar.js';
import { SERVICOS } from './constants.js';
import { formatarTelefone } from './validators.js';
import { escapeHtml, toast } from './ui.js';

const SHEETJS = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/xlsx.mjs';
const LINHAS_PREVIA = 100;

/**
 * dependencias:
 *   leads()              leads já carregados (para achar duplicados)
 *   membros()            [{ user_id, nome }]
 *   usuarioId()          id de quem está importando (vendedor padrão)
 *   gravar(leads, onProgresso) -> { criados, falhas }
 *   onConcluido(criados)
 */
export function criarImportacao({ leads, membros, usuarioId, gravar, onConcluido }) {
  const el = {
    modal: document.getElementById('modal-importar'),
    corpo: document.getElementById('importar-corpo'),
    rodape: document.getElementById('importar-rodape'),
  };
  const modal = new bootstrap.Modal(el.modal);
  const st = { linhas: [], temCabecalho: true, mapeamento: [], padroes: {}, resultado: [], nomeArquivo: '', gravando: false };

  el.modal.addEventListener('hide.bs.modal', (ev) => { if (st.gravando) ev.preventDefault(); });

  function abrir() {
    telaArquivo();
    modal.show();
  }

  // ---------------------------------------------------------------
  // Passo 1: arquivo
  // ---------------------------------------------------------------
  function telaArquivo() {
    el.corpo.innerHTML = `
      <label class="zona-arquivo" for="importar-arquivo" id="zona-arquivo">
        <i class="bi bi-file-earmark-spreadsheet fs-1 d-block mb-2" aria-hidden="true"></i>
        <span class="fw-semibold d-block">Clique para escolher ou arraste o arquivo aqui</span>
        <span class="small text-body-secondary">Excel (.xlsx), CSV ou TXT. Exportações do Google Maps, planilhas próprias, listas de CNPJ...</span>
        <input type="file" id="importar-arquivo" class="visually-hidden" accept=".csv,.txt,.tsv,.xlsx,.xls">
      </label>
      <p class="small text-body-secondary mt-3 mb-0">
        Precisa ter pelo menos <b>nome</b> e <b>telefone</b> de cada empresa. O segmento pode vir da planilha ou ser definido
        para todos no próximo passo. Nada é gravado antes de você conferir a prévia.
      </p>`;
    el.rodape.innerHTML = '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancelar</button>';

    const input = el.corpo.querySelector('#importar-arquivo');
    const zona = el.corpo.querySelector('#zona-arquivo');
    input.addEventListener('change', () => input.files[0] && lerArquivo(input.files[0]));
    zona.addEventListener('dragover', (ev) => { ev.preventDefault(); zona.classList.add('arrastando'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'));
    zona.addEventListener('drop', (ev) => {
      ev.preventDefault();
      zona.classList.remove('arrastando');
      if (ev.dataTransfer.files[0]) lerArquivo(ev.dataTransfer.files[0]);
    });
  }

  async function lerArquivo(arquivo) {
    el.corpo.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-2">Lendo o arquivo...</p></div>';
    try {
      let linhas;
      if (/\.xlsx?$/i.test(arquivo.name)) {
        const XLSX = await import(SHEETJS);
        const livro = XLSX.read(await arquivo.arrayBuffer(), { type: 'array', cellDates: true });
        const aba = livro.Sheets[livro.SheetNames[0]];
        linhas = XLSX.utils.sheet_to_json(aba, { header: 1, raw: false, defval: '', dateNF: 'dd/mm/yyyy' })
          .map((l) => l.map((v) => String(v ?? '').trim()))
          .filter((l) => l.some((v) => v !== ''));
      } else {
        linhas = lerCsv(await lerTexto(arquivo));
      }
      if (!linhas.length) throw new Error('O arquivo está vazio.');

      st.nomeArquivo = arquivo.name;
      st.linhas = linhas;
      st.temCabecalho = pareceCabecalho(linhas[0]);
      const largura = Math.max(...linhas.map((l) => l.length));
      st.linhas = linhas.map((l) => Array.from({ length: largura }, (_, i) => l[i] ?? ''));
      st.mapeamento = st.temCabecalho ? sugerirMapeamento(st.linhas[0]) : Array(largura).fill('');
      if (!st.temCabecalho) adivinharSemCabecalho();
      st.padroes = { segmento: '', origem: 'Importação', servico: '', vendedor_id: usuarioId() };
      telaMapeamento();
    } catch (erro) {
      console.error('[Importar]', erro);
      toast(`Não foi possível ler o arquivo: ${erro.message}`, 'erro');
      telaArquivo();
    }
  }

  /** Sem cabeçalho: a coluna com telefones vira telefone e a primeira de texto vira nome. */
  function adivinharSemCabecalho() {
    const amostra = st.linhas.slice(0, 20);
    const largura = st.mapeamento.length;
    for (let c = 0; c < largura; c++) {
      const valores = amostra.map((l) => l[c]);
      if (!st.mapeamento.includes('telefone') && valores.filter((v) => /\d{8,}/.test(v.replace(/\D/g, ''))).length > amostra.length / 2) {
        st.mapeamento[c] = 'telefone';
      }
    }
    const nomeCol = st.mapeamento.findIndex((m, c) => !m && amostra.some((l) => /[a-z]{3}/i.test(l[c])));
    if (nomeCol >= 0) st.mapeamento[nomeCol] = 'nome';
  }

  // ---------------------------------------------------------------
  // Passo 2: mapeamento + prévia
  // ---------------------------------------------------------------
  function dadosDasLinhas() {
    return st.temCabecalho ? st.linhas.slice(1) : st.linhas;
  }

  function telaMapeamento() {
    const cabecalho = st.temCabecalho ? st.linhas[0] : st.mapeamento.map((_, i) => `Coluna ${i + 1}`);
    const exemplo = dadosDasLinhas()[0] ?? [];
    const opcoes = (sel) => ['<option value="">— ignorar —</option>',
      ...CAMPOS_IMPORTACAO.map((c) => `<option value="${c.campo}" ${sel === c.campo ? 'selected' : ''}>${escapeHtml(c.rotulo)}</option>`)].join('');

    el.corpo.innerHTML = `
      <p class="mb-2"><i class="bi bi-file-earmark-check text-success me-1" aria-hidden="true"></i><b>${escapeHtml(st.nomeArquivo)}</b>
        · ${dadosDasLinhas().length} linha(s)</p>
      <div class="form-check mb-3">
        <input class="form-check-input" type="checkbox" id="imp-cabecalho" ${st.temCabecalho ? 'checked' : ''}>
        <label class="form-check-label" for="imp-cabecalho">A primeira linha é o cabeçalho (nome das colunas)</label>
      </div>

      <h3 class="h6 fw-bold">1. O que é cada coluna?</h3>
      <div class="table-responsive mb-3">
        <table class="table table-sm align-middle tabela-mapa">
          <thead><tr><th>Coluna da planilha</th><th>Exemplo</th><th>Vai para</th></tr></thead>
          <tbody>
            ${cabecalho.map((c, i) => `
              <tr>
                <td class="fw-semibold">${escapeHtml(c || `Coluna ${i + 1}`)}</td>
                <td class="text-body-secondary small text-truncate" style="max-width:260px">${escapeHtml(exemplo[i] ?? '')}</td>
                <td><select class="form-select form-select-sm" data-col="${i}" aria-label="Campo da coluna ${escapeHtml(c)}">${opcoes(st.mapeamento[i])}</select></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <h3 class="h6 fw-bold">2. Valores para quem não tiver na planilha</h3>
      <div class="row g-2 mb-3">
        <div class="col-12 col-md-3">
          <label class="form-label small" for="imp-segmento">Segmento</label>
          <input class="form-control form-control-sm" id="imp-segmento" list="lista-segmentos" value="${escapeHtml(st.padroes.segmento)}" placeholder="Ex.: Clínica odontológica">
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small" for="imp-origem">Origem</label>
          <input class="form-control form-control-sm" id="imp-origem" value="${escapeHtml(st.padroes.origem)}">
        </div>
        <div class="col-6 col-md-3">
          <label class="form-label small" for="imp-servico">Serviço</label>
          <select class="form-select form-select-sm" id="imp-servico">
            <option value="">Não definido</option>
            ${SERVICOS.map((s) => `<option ${st.padroes.servico === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}
          </select>
        </div>
        <div class="col-12 col-md-3">
          <label class="form-label small" for="imp-vendedor">Vendedor</label>
          <select class="form-select form-select-sm" id="imp-vendedor">
            ${membros().map((m) => `<option value="${m.user_id}" ${st.padroes.vendedor_id === m.user_id ? 'selected' : ''}>${escapeHtml(m.nome)}</option>`).join('')}
          </select>
        </div>
      </div>

      <h3 class="h6 fw-bold">3. Prévia</h3>
      <div id="imp-previa"></div>`;

    el.corpo.querySelector('#imp-cabecalho').addEventListener('change', (ev) => {
      st.temCabecalho = ev.target.checked;
      st.mapeamento = st.temCabecalho ? sugerirMapeamento(st.linhas[0]) : st.mapeamento.map(() => '');
      if (!st.temCabecalho) adivinharSemCabecalho();
      telaMapeamento();
    });
    el.corpo.querySelectorAll('select[data-col]').forEach((s) => s.addEventListener('change', () => {
      st.mapeamento[Number(s.dataset.col)] = s.value;
      atualizarPrevia();
    }));
    const liga = (id, campo) => el.corpo.querySelector(id).addEventListener('input', (ev) => {
      st.padroes[campo] = ev.target.value;
      atualizarPrevia();
    });
    liga('#imp-segmento', 'segmento');
    liga('#imp-origem', 'origem');
    liga('#imp-servico', 'servico');
    liga('#imp-vendedor', 'vendedor_id');

    atualizarPrevia();
  }

  function atualizarPrevia() {
    st.resultado = prepararImportacao(dadosDasLinhas(), st.mapeamento, st.padroes, leads(), st.temCabecalho ? st.linhas[0] : null);
    const ok = st.resultado.filter((r) => r.status === 'ok');
    const dup = st.resultado.filter((r) => r.status === 'duplicado');
    const inv = st.resultado.filter((r) => r.status === 'invalido');
    const faltaCampo = ['nome', 'telefone'].filter((c) => !st.mapeamento.includes(c));

    const previa = el.corpo.querySelector('#imp-previa');
    previa.innerHTML = `
      ${faltaCampo.length ? `<div class="alert alert-warning py-2 small">Escolha qual coluna é ${faltaCampo.map((c) => `<b>${c}</b>`).join(' e ')}.</div>` : ''}
      <div class="d-flex flex-wrap gap-2 mb-2">
        <span class="badge text-bg-success fs-6">${ok.length} prontos</span>
        <span class="badge text-bg-secondary fs-6">${dup.length} já cadastrados</span>
        <span class="badge text-bg-danger fs-6">${inv.length} com problema</span>
      </div>
      <div class="table-responsive tabela-previa">
        <table class="table table-sm align-middle mb-0">
          <thead><tr><th>#</th><th>Situação</th><th>Empresa</th><th>Telefone</th><th>Segmento</th><th>Motivo</th></tr></thead>
          <tbody>
            ${st.resultado.slice(0, LINHAS_PREVIA).map((r) => `
              <tr class="${r.status === 'invalido' ? 'table-danger' : r.status === 'duplicado' ? 'text-body-secondary' : ''}">
                <td>${r.numero}</td>
                <td>${r.status === 'ok' ? '<i class="bi bi-check-circle text-success" aria-label="Pronto"></i>'
                  : r.status === 'duplicado' ? '<i class="bi bi-files" aria-label="Duplicado"></i>'
                  : '<i class="bi bi-x-circle text-danger" aria-label="Com problema"></i>'}</td>
                <td>${escapeHtml(r.lead.nome ?? '')}</td>
                <td>${escapeHtml(r.lead.telefone ? formatarTelefone(r.lead.telefone) : '')}</td>
                <td>${escapeHtml(r.lead.segmento ?? '')}</td>
                <td class="small">${escapeHtml(r.motivo)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${st.resultado.length > LINHAS_PREVIA ? `<p class="small text-body-secondary mt-1">Mostrando ${LINHAS_PREVIA} de ${st.resultado.length} linhas.</p>` : ''}`;

    el.rodape.innerHTML = `
      <button type="button" class="btn btn-link me-auto" id="imp-voltar">Escolher outro arquivo</button>
      ${inv.length + dup.length ? '<button type="button" class="btn btn-outline-secondary" id="imp-baixar">Baixar linhas não importadas</button>' : ''}
      <button type="button" class="btn btn-success" id="imp-gravar" ${ok.length ? '' : 'disabled'}>
        <i class="bi bi-cloud-upload me-1" aria-hidden="true"></i>Importar ${ok.length} lead${ok.length === 1 ? '' : 's'}
      </button>`;
    el.rodape.querySelector('#imp-voltar').addEventListener('click', telaArquivo);
    el.rodape.querySelector('#imp-baixar')?.addEventListener('click', baixarRejeitadas);
    el.rodape.querySelector('#imp-gravar').addEventListener('click', () => gravarLeads(ok.map((r) => r.lead)));
  }

  function baixarRejeitadas() {
    const cab = st.temCabecalho ? st.linhas[0] : st.mapeamento.map((_, i) => `Coluna ${i + 1}`);
    const dados = dadosDasLinhas();
    const linhas = st.resultado.filter((r) => r.status !== 'ok').map((r) => [...dados[r.numero - 1], r.motivo]);
    const csv = [[...cab, 'Motivo'], ...linhas]
      .map((l) => l.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'nao-importados.csv' });
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------
  // Passo 3: gravação
  // ---------------------------------------------------------------
  async function gravarLeads(lista) {
    st.gravando = true;
    el.rodape.innerHTML = '';
    el.corpo.innerHTML = `
      <div class="py-4 text-center">
        <p class="fw-semibold mb-2">Importando <span id="imp-feito">0</span> de ${lista.length}...</p>
        <div class="progress" role="progressbar" aria-label="Progresso da importação"><div class="progress-bar" id="imp-barra" style="width:0%"></div></div>
      </div>`;
    const feito = el.corpo.querySelector('#imp-feito');
    const barra = el.corpo.querySelector('#imp-barra');
    try {
      const { criados, falhas } = await gravar(lista, (n, total) => {
        feito.textContent = n;
        barra.style.width = `${Math.round((n / total) * 100)}%`;
      });
      onConcluido(criados);
      el.corpo.innerHTML = `
        <div class="text-center py-4">
          <i class="bi bi-check-circle text-success fs-1 d-block mb-2" aria-hidden="true"></i>
          <p class="h5">${criados.length} lead${criados.length === 1 ? '' : 's'} importado${criados.length === 1 ? '' : 's'}.</p>
          ${falhas.length ? `<p class="text-danger">${falhas.length} não entraram (provavelmente cadastrados por outra pessoa enquanto você importava).</p>` : ''}
          <p class="text-body-secondary mb-0">Eles já aparecem em <b>Hoje → Novos para abordar</b>.</p>
        </div>`;
    } catch (erro) {
      console.error('[Importar]', erro);
      el.corpo.innerHTML = `<div class="alert alert-danger">A importação parou no meio: ${escapeHtml(erro.message)}. Os leads já gravados continuam no CRM; importe o arquivo de novo que os repetidos são pulados.</div>`;
    } finally {
      st.gravando = false;
      el.rodape.innerHTML = '<button type="button" class="btn btn-primary" data-bs-dismiss="modal">Fechar</button>';
    }
  }

  return { abrir };
}

/** Lê o arquivo como UTF-8; se aparecer caractere quebrado, tenta Windows-1252 (CSV salvo pelo Excel). */
async function lerTexto(arquivo) {
  const bytes = await arquivo.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(bytes);
  if (!utf8.includes('�')) return utf8;
  return new TextDecoder('windows-1252').decode(bytes);
}
