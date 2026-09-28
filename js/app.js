// Ponto de entrada do app.html: carrega os leads e liga funil, lista, filtros e cadastro.
import { exigirSessao, sair } from './auth.js';
import { ETAPAS, ETAPA_INICIAL, SERVICOS, SEGMENTOS_SUGERIDOS } from './constants.js';
import {
  validarLead, mascaraCnpj, mascaraTelefone, formatarCnpj, formatarTelefone,
  normalizarTexto, campoDoErroUnico, formatarDataBr,
} from './validators.js';
import { filtrarLeads, contarSituacoes } from './regras.js';
import * as leadsApi from './leads.js';
import { criarPipeline } from './pipeline.js';
import { criarLista } from './lista.js';
import { mensagemDeErro } from './supabase.js';
import { toast, estadoVazio, mostrarErros, limparValidacao, marcarInvalido, carregando, escapeHtml } from './ui.js';

const CHAVE_VISAO = 'crm-visao';
const CHAVE_TEMA = 'crm-tema';

const estado = {
  leads: [],
  filtros: { busca: '', segmento: '', servico: '', situacao: null },
  visao: lerPreferencia(CHAVE_VISAO) === 'lista' ? 'lista' : 'funil',
  editando: null, // lead aberto no modal (null = novo)
  carregado: false,
};

const el = {
  resumo: document.getElementById('resumo'),
  funil: document.getElementById('visao-funil'),
  lista: document.getElementById('visao-lista'),
  vazio: document.getElementById('estado-vazio'),
  contador: document.getElementById('contador-leads'),
  busca: document.getElementById('busca'),
  filtroSegmento: document.getElementById('filtro-segmento'),
  filtroServico: document.getElementById('filtro-servico'),
  btnLimpar: document.getElementById('btn-limpar-filtros'),
  modal: document.getElementById('modal-lead'),
  form: document.getElementById('form-lead'),
  titulo: document.getElementById('modal-lead-titulo'),
  datas: document.getElementById('lead-datas'),
  btnExcluir: document.getElementById('btn-excluir-lead'),
  btnSalvar: document.getElementById('btn-salvar-lead'),
  datalist: document.getElementById('lista-segmentos'),
  confirmarExclusao: document.getElementById('confirmar-exclusao'),
  confirmarTexto: document.getElementById('confirmar-exclusao-texto'),
  btnConfirmarExclusao: document.getElementById('btn-confirmar-exclusao'),
  btnCancelarExclusao: document.getElementById('btn-cancelar-exclusao'),
};
const modalLead = new bootstrap.Modal(el.modal);

const abrirPorId = (id) => abrirFormulario(estado.leads.find((l) => l.id === id));
const pipeline = criarPipeline(el.funil, el.resumo, {
  onAbrir: abrirPorId,
  onNovo: (etapa) => abrirFormulario(null, etapa),
  onMover: mover,
});
const lista = criarLista(el.lista, { onAbrir: abrirPorId });

// ---------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------
async function iniciar() {
  const usuario = await exigirSessao();
  if (!usuario) return;

  document.getElementById('usuario-email').textContent = usuario.email;
  document.getElementById('btn-sair').addEventListener('click', sair);
  document.getElementById('btn-tema').addEventListener('click', alternarTema);
  document.querySelectorAll('[data-acao="novo-lead"]').forEach((b) =>
    b.addEventListener('click', () => abrirFormulario(null)));

  prepararFiltros();
  prepararFormulario();
  await carregarLeads();
}

async function carregarLeads() {
  try {
    estado.leads = await leadsApi.listarLeads();
    estado.carregado = true;
    render();
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Carregar leads'), 'erro');
    el.funil.innerHTML = '';
    el.vazio.classList.remove('d-none');
    estadoVazio(el.vazio, {
      icone: 'bi-wifi-off',
      titulo: 'Não foi possível carregar os leads.',
      acoes: [{ texto: 'Tentar novamente', icone: 'bi-arrow-clockwise', onClick: carregarLeads }],
    });
  }
}

// ---------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------
function render() {
  const total = estado.leads.length;
  const filtrados = filtrarLeads(estado.leads, estado.filtros);
  const temFiltro = filtroAtivo();

  el.contador.textContent = total ? `${filtrados.length} de ${total}` : '';
  el.btnLimpar.classList.toggle('d-none', !temFiltro);
  atualizarChips();
  atualizarOpcoesSegmento();

  // Estado vazio: sem nenhum lead, ou filtros que não encontram nada
  el.vazio.classList.toggle('d-none', total > 0 && filtrados.length > 0);
  if (!total) {
    estadoVazio(el.vazio, {
      icone: 'bi-person-plus',
      titulo: 'Nenhum lead ainda.',
      texto: 'Cadastre o primeiro lead. A importação de arquivos CSV/TXT chega na Fase 3.',
      acoes: [{ texto: 'Cadastrar lead', icone: 'bi-plus-lg', classe: 'btn-success', onClick: () => abrirFormulario(null) }],
    });
  } else if (!filtrados.length) {
    estadoVazio(el.vazio, {
      icone: 'bi-funnel',
      titulo: 'Nenhum lead com esses filtros.',
      acoes: [{ texto: 'Limpar filtros', classe: 'btn-outline-secondary', onClick: limparFiltros }],
    });
  }

  const funil = estado.visao === 'funil';
  el.funil.classList.toggle('d-none', !funil);
  el.resumo.classList.toggle('d-none', !funil);
  el.lista.classList.toggle('d-none', funil || !filtrados.length);

  // O funil aparece mesmo vazio: as colunas mostram onde cada lead vai cair
  if (funil) pipeline.render(filtrados);
  else if (filtrados.length) lista.render(filtrados);
}

// ---------------------------------------------------------------------
// Mover de etapa (drag and drop ou "Mover para")
// ---------------------------------------------------------------------
async function mover(id, etapa) {
  const lead = estado.leads.find((l) => l.id === id);
  if (!lead || lead.etapa === etapa) {
    render();
    return;
  }
  try {
    const atualizado = await leadsApi.moverLead(id, etapa);
    estado.leads = estado.leads.map((l) => (l.id === id ? atualizado : l));
  } catch (erro) {
    // Estado não mudou: o render abaixo devolve o card para a coluna original
    toast(`${mensagemDeErro(erro, 'Mover lead')} O card voltou para "${lead.etapa}".`, 'erro');
  }
  render();
}

// ---------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------
function prepararFiltros() {
  el.filtroServico.insertAdjacentHTML('beforeend',
    SERVICOS.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join(''));

  el.busca.addEventListener('input', () => { estado.filtros.busca = el.busca.value; render(); });
  el.filtroSegmento.addEventListener('change', () => { estado.filtros.segmento = el.filtroSegmento.value; render(); });
  el.filtroServico.addEventListener('change', () => { estado.filtros.servico = el.filtroServico.value; render(); });
  el.btnLimpar.addEventListener('click', limparFiltros);

  document.querySelectorAll('[data-situacao]').forEach((b) => b.addEventListener('click', () => {
    const s = b.dataset.situacao;
    estado.filtros.situacao = estado.filtros.situacao === s ? null : s;
    render();
  }));

  const radio = document.querySelector(`input[name="visao"][value="${estado.visao}"]`);
  if (radio) radio.checked = true;
  document.querySelectorAll('input[name="visao"]').forEach((r) => r.addEventListener('change', () => {
    estado.visao = r.value;
    salvarPreferencia(CHAVE_VISAO, r.value);
    render();
  }));
}

function filtroAtivo() {
  const f = estado.filtros;
  return Boolean(f.busca.trim() || f.segmento || f.servico || f.situacao);
}

function limparFiltros() {
  estado.filtros = { busca: '', segmento: '', servico: '', situacao: null };
  el.busca.value = '';
  el.filtroSegmento.value = '';
  el.filtroServico.value = '';
  render();
}

function atualizarChips() {
  const c = contarSituacoes(estado.leads);
  document.querySelectorAll('[data-num]').forEach((s) => { s.textContent = c[s.dataset.num]; });
  document.querySelectorAll('[data-situacao]').forEach((b) => {
    const ativo = estado.filtros.situacao === b.dataset.situacao;
    b.classList.toggle('ativo', ativo);
    b.setAttribute('aria-pressed', String(ativo));
  });
}

/** Segmentos existentes, sem repetir variações de maiúscula/acento. */
function segmentosCadastrados() {
  const vistos = new Map();
  for (const s of estado.leads.map((l) => l.segmento)) {
    const chave = normalizarTexto(s);
    if (chave && !vistos.has(chave)) vistos.set(chave, s);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function atualizarOpcoesSegmento() {
  const atual = estado.filtros.segmento;
  el.filtroSegmento.innerHTML = '<option value="">Todos os segmentos</option>'
    + segmentosCadastrados().map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  el.filtroSegmento.value = atual;
}

// ---------------------------------------------------------------------
// Formulário
// ---------------------------------------------------------------------
function prepararFormulario() {
  const f = el.form;
  f.servico.insertAdjacentHTML('beforeend',
    SERVICOS.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join(''));
  f.etapa.innerHTML = ETAPAS.map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join('');

  f.cnpj.addEventListener('input', () => { f.cnpj.value = mascaraCnpj(f.cnpj.value); });
  f.telefone.addEventListener('input', () => { f.telefone.value = mascaraTelefone(f.telefone.value); });

  // Validação ao sair do campo (só mostra erro de campo já preenchido)
  for (const nome of ['nome', 'cnpj', 'telefone', 'segmento']) {
    f[nome].addEventListener('blur', () => validarCampo(nome));
    f[nome].addEventListener('input', () => limparValidacao(f, nome));
  }

  f.addEventListener('submit', salvar);
  el.btnExcluir.addEventListener('click', pedirConfirmacaoExclusao);
  el.btnConfirmarExclusao.addEventListener('click', excluir);
  el.btnCancelarExclusao.addEventListener('click', () => {
    esconderConfirmacaoExclusao();
    el.btnExcluir.focus();
  });
  el.modal.addEventListener('shown.bs.modal', () => f.nome.focus());
}

function atualizarDatalistSegmentos() {
  const vistos = new Map();
  for (const s of [...SEGMENTOS_SUGERIDOS, ...segmentosCadastrados()]) {
    const chave = normalizarTexto(s);
    if (chave && !vistos.has(chave)) vistos.set(chave, s);
  }
  el.datalist.innerHTML = [...vistos.values()]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((s) => `<option value="${escapeHtml(s)}"></option>`).join('');
}

function abrirFormulario(lead, etapaInicial = ETAPA_INICIAL) {
  const f = el.form;
  estado.editando = lead ?? null;
  f.reset();
  limparValidacao(f);
  esconderConfirmacaoExclusao();
  atualizarDatalistSegmentos();

  if (lead) {
    el.titulo.textContent = 'Editar lead';
    f.nome.value = lead.nome;
    f.cnpj.value = lead.cnpj ? formatarCnpj(lead.cnpj) : '';
    f.telefone.value = formatarTelefone(lead.telefone);
    f.responsavel.value = lead.responsavel ?? '';
    f.segmento.value = lead.segmento;
    f.servico.value = lead.servico ?? '';
    f.etapa.value = lead.etapa;
    f.follow_up_em.value = lead.follow_up_em ?? '';
    f.origem.value = lead.origem ?? '';
    f.observacoes.value = lead.observacoes ?? '';
    el.datas.textContent = `Criado em ${formatarDataBr(lead.criado_em)} · Na etapa desde ${formatarDataBr(lead.movido_em)}`
      + (lead.ultimo_contato_em ? ` · Último contato em ${formatarDataBr(lead.ultimo_contato_em)}` : '');
    el.btnExcluir.classList.remove('d-none');
  } else {
    el.titulo.textContent = 'Novo lead';
    f.etapa.value = etapaInicial;
    el.datas.textContent = '';
    el.btnExcluir.classList.add('d-none');
  }
  modalLead.show();
}

function dadosDoForm() {
  return Object.fromEntries(new FormData(el.form));
}

/** Duplicados na lista já carregada (resposta imediata, sem ir ao banco). */
function duplicadosLocais(lead) {
  const idAtual = estado.editando?.id;
  const erros = {};
  const outros = estado.leads.filter((l) => l.id !== idAtual);
  const porCnpj = lead.cnpj && outros.find((l) => l.cnpj === lead.cnpj);
  const porTel = lead.telefone && outros.find((l) => l.telefone === lead.telefone);
  if (porCnpj) erros.cnpj = mensagemDuplicado('CNPJ', porCnpj);
  if (porTel) erros.telefone = mensagemDuplicado('telefone', porTel);
  return erros;
}

function mensagemDuplicado(campo, lead) {
  return `Este ${campo} já é usado pelo lead "${lead.nome}" (etapa ${lead.etapa}).`;
}

function validarCampo(nome) {
  const f = el.form;
  if (!f[nome].value.trim()) return; // campo vazio só é cobrado ao salvar
  const { erros, lead } = validarLead(dadosDoForm());
  const todos = { ...duplicadosLocais(lead), ...erros };
  if (todos[nome]) marcarInvalido(f, nome, todos[nome]);
}

async function salvar(ev) {
  ev.preventDefault();
  const f = el.form;
  const { erros: errosCampos, lead } = validarLead(dadosDoForm());
  const erros = { ...duplicadosLocais(lead), ...errosCampos };
  if (Object.keys(erros).length) {
    mostrarErros(f, erros);
    return;
  }

  const restaurar = carregando(el.btnSalvar);
  const editando = estado.editando;
  try {
    // Confere no banco também (outra aba ou importação pode ter criado o mesmo dado)
    const conflitos = await leadsApi.buscarConflitos(lead, editando?.id);
    const errosBanco = {};
    if (conflitos.cnpj) errosBanco.cnpj = mensagemDuplicado('CNPJ', conflitos.cnpj);
    if (conflitos.telefone) errosBanco.telefone = mensagemDuplicado('telefone', conflitos.telefone);
    if (Object.keys(errosBanco).length) {
      mostrarErros(f, errosBanco);
      return;
    }

    const salvo = editando
      ? await leadsApi.atualizarLead(editando.id, lead, editando.etapa)
      : await leadsApi.criarLead(lead);

    if (editando) estado.leads = estado.leads.map((l) => (l.id === salvo.id ? salvo : l));
    else estado.leads.unshift(salvo);
    render();
    modalLead.hide();
    toast(editando ? 'Lead atualizado.' : 'Lead cadastrado.', 'sucesso');
  } catch (erro) {
    await tratarErroSalvar(erro, lead);
  } finally {
    restaurar();
  }
}

async function tratarErroSalvar(erro, lead) {
  const campo = campoDoErroUnico(erro);
  if (!campo) {
    toast(mensagemDeErro(erro, 'Salvar lead'), 'erro');
    return;
  }
  // Erro de unique do banco: descobre qual lead já usa o dado para mostrar o nome
  const rotulo = campo === 'cnpj' ? 'CNPJ' : 'telefone';
  let mensagem = `Já existe um lead com este ${rotulo}.`;
  try {
    const conflitos = await leadsApi.buscarConflitos(lead, estado.editando?.id);
    if (conflitos[campo]) mensagem = mensagemDuplicado(rotulo, conflitos[campo]);
  } catch { /* mantém a mensagem genérica */ }
  mostrarErros(el.form, { [campo]: mensagem });
}

// Confirmação fica dentro do próprio modal (modal sobre modal disputa o foco no Bootstrap)
function pedirConfirmacaoExclusao() {
  const lead = estado.editando;
  if (!lead) return;
  el.confirmarTexto.textContent =
    `Excluir "${lead.nome}"? O histórico de contatos dele também será apagado. Não dá para desfazer.`;
  el.confirmarExclusao.classList.remove('d-none');
  el.btnConfirmarExclusao.focus();
}

function esconderConfirmacaoExclusao() {
  el.confirmarExclusao.classList.add('d-none');
}

async function excluir() {
  const lead = estado.editando;
  if (!lead) return;
  const restaurar = carregando(el.btnConfirmarExclusao, 'Excluindo...');
  try {
    await leadsApi.excluirLead(lead.id);
    estado.leads = estado.leads.filter((l) => l.id !== lead.id);
    render();
    modalLead.hide();
    toast('Lead excluído.', 'sucesso');
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Excluir lead'), 'erro');
  } finally {
    restaurar();
  }
}

// ---------------------------------------------------------------------
// Tema e preferências (localStorage pode estar bloqueado: tudo em try/catch)
// ---------------------------------------------------------------------
function alternarTema() {
  const novo = document.documentElement.dataset.bsTheme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.bsTheme = novo;
  salvarPreferencia(CHAVE_TEMA, novo);
}

function lerPreferencia(chave) {
  try { return localStorage.getItem(chave); } catch { return null; }
}

function salvarPreferencia(chave, valor) {
  try { localStorage.setItem(chave, valor); } catch { /* sem persistência */ }
}

iniciar();
