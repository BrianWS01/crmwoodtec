// Ponto de entrada do app.html: carrega os dados e liga fila do dia, funil, lista, resultados,
// cadastro, envio de WhatsApp, importação e configurações.
import { exigirSessao, sair } from './auth.js';
import { ETAPAS, ETAPA_INICIAL, SERVICOS, SEGMENTOS_SUGERIDOS } from './constants.js';
import {
  validarLead, mascaraCnpj, mascaraTelefone, formatarCnpj, formatarTelefone, validarCnpj,
  normalizarTexto, campoDoErroUnico, formatarDataBr, hojeIso,
} from './validators.js';
import { filtrarLeads, contarSituacoes, montarFila, somarDias } from './regras.js';
import { primeiroNome } from './mensagens.js';
import { inicioDoPeriodo } from './metricas.js';
import { consultarCnpj } from './cnpj.js';
import * as leadsApi from './leads.js';
import * as dados from './dados.js';
import { criarPipeline } from './pipeline.js';
import { criarLista } from './lista.js';
import { criarFila } from './fila.js';
import { criarPainel } from './painel.js';
import { criarEnvio } from './envio.js';
import { criarImportacao } from './importacao.js';
import { criarConfiguracoes } from './configuracoes.js';
import { supabase, mensagemDeErro } from './supabase.js';
import {
  toast, estadoVazio, mostrarErros, limparValidacao, marcarInvalido, carregando, escapeHtml, confirmar,
} from './ui.js';

const CHAVE_VISAO = 'crm-visao';
const CHAVE_TEMA = 'crm-tema';
const CHAVE_VENDEDOR = 'crm-filtro-vendedor';
const VISOES = ['hoje', 'funil', 'lista', 'resultados'];

const TITULOS = {
  hoje: ['Hoje', 'Quem precisa de contato agora. Resolva de cima para baixo.'],
  funil: ['Pipeline', 'Arraste o card para mudar a etapa. O próximo retorno é agendado sozinho.'],
  lista: ['Lista', 'Todos os leads em tabela, por prioridade.'],
  resultados: ['Resultados', 'Como está o comercial no período.'],
};

const estado = {
  usuario: null,
  leads: [],
  membros: [],
  mensagens: [],
  filtros: { busca: '', segmento: '', servico: '', vendedor: lerPreferencia(CHAVE_VENDEDOR) ?? '', situacao: null },
  visao: VISOES.includes(lerPreferencia(CHAVE_VISAO)) ? lerPreferencia(CHAVE_VISAO) : 'hoje',
  editando: null, // lead aberto no modal (null = novo)
  carregado: false,
  carregadoEm: 0,
};

const el = {
  titulo: document.getElementById('titulo-visao'),
  subtitulo: document.getElementById('subtitulo-visao'),
  badgeHoje: document.getElementById('badge-hoje'),
  resumo: document.getElementById('resumo'),
  filtros: document.getElementById('filtros'),
  chips: document.getElementById('chips-situacao'),
  hoje: document.getElementById('visao-hoje'),
  funil: document.getElementById('visao-funil'),
  lista: document.getElementById('visao-lista'),
  resultados: document.getElementById('visao-resultados'),
  carregando: document.getElementById('carregando'),
  vazio: document.getElementById('estado-vazio'),
  contador: document.getElementById('contador-leads'),
  busca: document.getElementById('busca'),
  filtroVendedor: document.getElementById('filtro-vendedor'),
  filtroSegmento: document.getElementById('filtro-segmento'),
  filtroServico: document.getElementById('filtro-servico'),
  btnLimpar: document.getElementById('btn-limpar-filtros'),
  modal: document.getElementById('modal-lead'),
  form: document.getElementById('form-lead'),
  tituloModal: document.getElementById('modal-lead-titulo'),
  abas: document.getElementById('abas-lead'),
  datas: document.getElementById('lead-datas'),
  btnExcluir: document.getElementById('btn-excluir-lead'),
  btnSalvar: document.getElementById('btn-salvar-lead'),
  btnWhats: document.getElementById('btn-whats-modal'),
  btnCnpj: document.getElementById('btn-buscar-cnpj'),
  datalist: document.getElementById('lista-segmentos'),
  datalistOrigens: document.getElementById('lista-origens'),
  confirmarExclusao: document.getElementById('confirmar-exclusao'),
  confirmarTexto: document.getElementById('confirmar-exclusao-texto'),
  btnConfirmarExclusao: document.getElementById('btn-confirmar-exclusao'),
  btnCancelarExclusao: document.getElementById('btn-cancelar-exclusao'),
  historicoLista: document.getElementById('historico-lista'),
  historicoNum: document.getElementById('historico-num'),
  novaNota: document.getElementById('nova-nota'),
  btnNota: document.getElementById('btn-salvar-nota'),
  notaRetorno: document.getElementById('nota-retorno'),
};
const modalLead = new bootstrap.Modal(el.modal);

// ---------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------
const acharLead = (id) => estado.leads.find((l) => l.id === id);
const abrirPorId = (id) => abrirFormulario(acharLead(id));
const enviarPorId = (id) => { const l = acharLead(id); if (l) envio.abrir(l); };

/** Nome curto do vendedor para etiquetas (só faz sentido com mais de uma pessoa na equipe). */
function nomeDoVendedor(id) {
  if (estado.membros.length < 2 || !id) return '';
  return primeiroNome(estado.membros.find((m) => m.user_id === id)?.nome ?? '');
}

function nomeUsuario() {
  return estado.membros.find((m) => m.user_id === estado.usuario?.id)?.nome ?? estado.usuario?.email?.split('@')[0] ?? '';
}

const pipeline = criarPipeline(el.funil, el.resumo, {
  onAbrir: abrirPorId,
  onNovo: (etapa) => abrirFormulario(null, etapa),
  onMover: mover,
  onEnviar: enviarPorId,
  nomeDoVendedor,
});
const lista = criarLista(el.lista, { onAbrir: abrirPorId, onEnviar: enviarPorId, nomeDoVendedor });
const fila = criarFila(el.hoje, {
  onAbrir: abrirPorId,
  onEnviar: enviarPorId,
  onAdiar: adiar,
  onMover: async (id, etapa) => {
    const lead = acharLead(id);
    if (etapa === 'Perdido' && !await confirmar({
      titulo: 'Marcar como perdido',
      mensagem: `Marcar "${lead?.nome}" como perdido? Ele sai da fila e do funil ativo (dá para voltar depois).`,
      textoBotao: 'Marcar como perdido',
      perigo: true,
    })) return;
    mover(id, etapa);
  },
});
el.hoje.addEventListener('fila:rerender', () => render());
const painel = criarPainel(el.resultados, {
  carregarEnvios: (dias) => dados.listarEnvios(dias ? inicioDoPeriodo(dias) : null),
});
const envio = criarEnvio({
  mensagens: () => estado.mensagens,
  nomeUsuario,
  registrar: async (id, texto) => {
    try {
      return await leadsApi.registrarEnvio(id, texto);
    } catch (erro) {
      toast(mensagemDeErro(erro, 'Registrar envio'), 'erro');
      return null;
    }
  },
  onRegistrado: (lead) => {
    substituirLead(lead);
    render();
    toast(`Envio registrado.${lead.follow_up_em ? ` Próximo retorno: ${formatarDataBr(lead.follow_up_em)}.` : ''}`, 'sucesso');
  },
});
const importacao = criarImportacao({
  leads: () => estado.leads,
  membros: () => estado.membros,
  usuarioId: () => estado.usuario?.id,
  gravar: leadsApi.criarLeadsEmLote,
  onConcluido: (criados) => {
    const ids = new Set(estado.leads.map((l) => l.id));
    estado.leads.unshift(...criados.filter((l) => !ids.has(l.id)));
    render();
  },
});
const configuracoes = criarConfiguracoes({
  mensagens: () => estado.mensagens,
  setMensagens: (lista) => { estado.mensagens = lista; },
  membros: () => estado.membros,
  setMembros: (lista) => { estado.membros = lista; prepararVendedores(); render(); },
  usuarioId: () => estado.usuario?.id,
  nomeUsuario,
});

// ---------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------
async function iniciar() {
  const usuario = await exigirSessao();
  if (!usuario) return;
  estado.usuario = usuario;

  document.getElementById('usuario-email').textContent = usuario.email;
  document.getElementById('btn-sair').addEventListener('click', sair);
  document.getElementById('btn-tema').addEventListener('click', alternarTema);
  document.getElementById('btn-importar').addEventListener('click', () => importacao.abrir());
  document.getElementById('btn-config').addEventListener('click', () => configuracoes.abrir());
  document.querySelectorAll('[data-acao="novo-lead"]').forEach((b) =>
    b.addEventListener('click', () => abrirFormulario(null)));

  prepararFiltros();
  prepararFormulario();
  await carregarTudo();
  assinarTempoReal();

  // Voltou para a aba depois de um tempo: recarrega (pega o que o sócio mudou e a virada do dia)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - estado.carregadoEm > 5 * 60 * 1000) carregarLeads();
  });
}

async function carregarTudo() {
  const [membros, mensagens] = await Promise.allSettled([dados.listarMembros(), dados.listarMensagens()]);
  const falhaSchema = [membros, mensagens].find((r) => r.status === 'rejected');
  if (falhaSchema) {
    console.error('[Carregar]', falhaSchema.reason);
    avisoSchema();
  }
  estado.membros = membros.value ?? [];
  estado.mensagens = mensagens.value ?? [];
  if (!falhaSchema && !estado.membros.some((m) => m.user_id === estado.usuario.id)) avisoSchema();
  prepararVendedores();
  await carregarLeads();
}

function avisoSchema() {
  if (document.getElementById('aviso-schema')) return;
  el.filtros.insertAdjacentHTML('beforebegin', `
    <div class="alert alert-warning" id="aviso-schema">
      <b>Falta atualizar o banco.</b> Abra o Supabase → <b>SQL Editor</b>, cole todo o arquivo <code>supabase/schema.sql</code>
      e clique em <b>Run</b>. Sem isso, equipe, mensagens, follow-up automático e histórico não funcionam.
    </div>`);
}

async function carregarLeads() {
  try {
    estado.leads = await leadsApi.listarLeads();
    estado.carregado = true;
    estado.carregadoEm = Date.now();
    render();
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Carregar leads'), 'erro');
    el.carregando.classList.add('d-none');
    el.vazio.classList.remove('d-none');
    estadoVazio(el.vazio, {
      icone: 'bi-wifi-off',
      titulo: 'Não foi possível carregar os leads.',
      acoes: [{ texto: 'Tentar novamente', icone: 'bi-arrow-clockwise', onClick: carregarLeads }],
    });
  }
}

// ---------------------------------------------------------------------
// Tempo real: mudanças feitas pelo sócio aparecem sem recarregar
// ---------------------------------------------------------------------
let renderAgendado = null;
function assinarTempoReal() {
  supabase.channel('leads-equipe')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (p) => {
      if (p.eventType === 'DELETE') estado.leads = estado.leads.filter((l) => l.id !== p.old.id);
      else if (acharLead(p.new.id)) substituirLead(p.new);
      else estado.leads.unshift(p.new);
      agendarRender();
    })
    .subscribe();
}

function agendarRender() {
  clearTimeout(renderAgendado);
  renderAgendado = setTimeout(() => {
    // Não redesenha no meio de um arrastar (perderia o card da mão)
    if (el.funil.classList.contains('arrastando')) return agendarRender();
    render();
  }, 400);
}

function substituirLead(lead) {
  estado.leads = estado.leads.map((l) => (l.id === lead.id ? lead : l));
  if (estado.editando?.id === lead.id) estado.editando = lead;
}

// ---------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------
function render() {
  if (!estado.carregado) return;
  el.carregando.classList.add('d-none');

  const total = estado.leads.length;
  const filtrados = filtrarLeads(estado.leads, estado.filtros);
  const temFiltro = filtroAtivo();
  const v = estado.visao;

  [el.titulo.textContent, el.subtitulo.textContent] = TITULOS[v];
  el.contador.textContent = total ? `${filtrados.length} de ${total}` : '';
  el.btnLimpar.classList.toggle('d-none', !temFiltro);
  el.filtros.classList.toggle('d-none', v === 'resultados');
  el.chips.classList.toggle('d-none', v === 'hoje');
  atualizarChips();
  atualizarOpcoesSegmento();
  atualizarBadgeHoje();

  // Estado vazio: sem nenhum lead, ou filtros que não encontram nada
  const mostrarVazio = v !== 'resultados' && (!total || !filtrados.length);
  el.vazio.classList.toggle('d-none', !mostrarVazio);
  if (!total) {
    estadoVazio(el.vazio, {
      icone: 'bi-person-plus',
      titulo: 'Nenhum lead ainda.',
      texto: 'Importe uma planilha com vários de uma vez ou cadastre o primeiro na mão.',
      acoes: [
        { texto: 'Importar planilha', icone: 'bi-upload', classe: 'btn-primary', onClick: () => importacao.abrir() },
        { texto: 'Cadastrar lead', icone: 'bi-plus-lg', classe: 'btn-success', onClick: () => abrirFormulario(null) },
      ],
    });
  } else if (!filtrados.length) {
    estadoVazio(el.vazio, {
      icone: 'bi-funnel',
      titulo: 'Nenhum lead com esses filtros.',
      acoes: [{ texto: 'Limpar filtros', classe: 'btn-outline-secondary', onClick: limparFiltros }],
    });
  }

  el.hoje.classList.toggle('d-none', v !== 'hoje' || !filtrados.length);
  el.funil.classList.toggle('d-none', v !== 'funil');
  el.resumo.classList.toggle('d-none', v !== 'funil');
  el.lista.classList.toggle('d-none', v !== 'lista' || !filtrados.length);
  el.resultados.classList.toggle('d-none', v !== 'resultados');

  if (v === 'hoje' && filtrados.length) fila.render(filtrados, { nomeUsuario: nomeUsuario(), nomeDoVendedor });
  else if (v === 'funil') pipeline.render(filtrados); // aparece mesmo vazio: as colunas mostram onde cada lead vai cair
  else if (v === 'lista' && filtrados.length) lista.render(filtrados);
  else if (v === 'resultados') painel.render(estado.leads, estado.membros);
}

function atualizarBadgeHoje() {
  const f = montarFila(filtrarLeads(estado.leads, { vendedor: estado.filtros.vendedor }));
  const urgentes = f.atrasados.length + f.hoje.length;
  el.badgeHoje.textContent = urgentes;
  el.badgeHoje.classList.toggle('d-none', !urgentes);
  el.badgeHoje.title = `${f.atrasados.length} atrasados, ${f.hoje.length} para hoje`;
}

// ---------------------------------------------------------------------
// Ações rápidas: mover, adiar
// ---------------------------------------------------------------------
async function mover(id, etapa) {
  const lead = acharLead(id);
  if (!lead || lead.etapa === etapa) {
    render();
    return;
  }
  try {
    const atualizado = await leadsApi.moverLead(id, etapa);
    substituirLead(atualizado);
    toast(`"${lead.nome}" → ${etapa}.${atualizado.follow_up_em && atualizado.follow_up_em !== lead.follow_up_em
      ? ` Retorno agendado para ${formatarDataBr(atualizado.follow_up_em)}.` : ''}`, 'sucesso');
  } catch (erro) {
    // Estado não mudou: o render abaixo devolve o card para a coluna original
    toast(`${mensagemDeErro(erro, 'Mover lead')} O card voltou para "${lead.etapa}".`, 'erro');
  }
  render();
}

async function adiar(id, dataIso) {
  try {
    const atualizado = await leadsApi.definirFollowUp(id, dataIso);
    substituirLead(atualizado);
    render();
    toast(`Retorno adiado para ${formatarDataBr(dataIso)}.`, 'sucesso');
    return atualizado;
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Adiar'), 'erro');
    return null;
  }
}

// ---------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------
function prepararFiltros() {
  el.filtroServico.insertAdjacentHTML('beforeend',
    SERVICOS.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join(''));

  el.busca.addEventListener('input', () => { estado.filtros.busca = el.busca.value; render(); });
  el.filtroVendedor.addEventListener('change', () => {
    estado.filtros.vendedor = el.filtroVendedor.value;
    salvarPreferencia(CHAVE_VENDEDOR, el.filtroVendedor.value);
    render();
  });
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

/** Preenche o filtro e o campo de vendedor com a equipe. */
function prepararVendedores() {
  const eu = estado.usuario?.id;
  const opcoes = estado.membros.map((m) =>
    `<option value="${m.user_id}">${escapeHtml(m.nome)}${m.user_id === eu ? ' (você)' : ''}</option>`).join('');
  el.filtroVendedor.innerHTML = `<option value="">Toda a equipe</option>${opcoes}`;
  if (!estado.membros.some((m) => m.user_id === estado.filtros.vendedor)) estado.filtros.vendedor = '';
  el.filtroVendedor.value = estado.filtros.vendedor;
  el.filtroVendedor.classList.toggle('d-none', estado.membros.length < 2);
  el.form.vendedor_id.innerHTML = opcoes || `<option value="${eu ?? ''}">Você</option>`;
}

function filtroAtivo() {
  const f = estado.filtros;
  return Boolean(f.busca.trim() || f.segmento || f.servico || f.vendedor || f.situacao);
}

function limparFiltros() {
  estado.filtros = { busca: '', segmento: '', servico: '', vendedor: '', situacao: null };
  el.busca.value = '';
  el.filtroVendedor.value = '';
  el.filtroSegmento.value = '';
  el.filtroServico.value = '';
  salvarPreferencia(CHAVE_VENDEDOR, '');
  render();
}

function atualizarChips() {
  const c = contarSituacoes(filtrarLeads(estado.leads, { vendedor: estado.filtros.vendedor }));
  document.querySelectorAll('[data-num]').forEach((s) => { s.textContent = c[s.dataset.num]; });
  document.querySelectorAll('[data-situacao]').forEach((b) => {
    const ativo = estado.filtros.situacao === b.dataset.situacao;
    b.classList.toggle('ativo', ativo);
    b.setAttribute('aria-pressed', String(ativo));
  });
}

/** Valores distintos de um campo, sem repetir variações de maiúscula/acento. */
function valoresCadastrados(campo, extras = []) {
  const vistos = new Map();
  for (const s of [...extras, ...estado.leads.map((l) => l[campo])]) {
    const chave = normalizarTexto(s);
    if (chave && !vistos.has(chave)) vistos.set(chave, s);
  }
  return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function atualizarOpcoesSegmento() {
  const atual = estado.filtros.segmento;
  el.filtroSegmento.innerHTML = '<option value="">Todos os segmentos</option>'
    + valoresCadastrados('segmento').map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  el.filtroSegmento.value = atual;
  // datalists usados no cadastro, na importação e nas mensagens
  el.datalist.innerHTML = valoresCadastrados('segmento', SEGMENTOS_SUGERIDOS)
    .map((s) => `<option value="${escapeHtml(s)}"></option>`).join('');
  el.datalistOrigens.innerHTML = valoresCadastrados('origem', ['Google Maps', 'Instagram', 'Indicação', 'Site', 'Importação'])
    .map((s) => `<option value="${escapeHtml(s)}"></option>`).join('');
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
  f.uf.addEventListener('input', () => { f.uf.value = f.uf.value.toUpperCase().replace(/[^A-Z]/g, ''); });
  f.cnpj.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); buscarCnpj(); } });

  // Validação ao sair do campo (só mostra erro de campo já preenchido)
  for (const nome of ['nome', 'cnpj', 'telefone', 'segmento', 'email', 'uf']) {
    f[nome].addEventListener('blur', () => validarCampo(nome));
    f[nome].addEventListener('input', () => limparValidacao(f, nome));
  }

  f.addEventListener('submit', salvar);
  el.btnCnpj.addEventListener('click', buscarCnpj);
  el.btnExcluir.addEventListener('click', pedirConfirmacaoExclusao);
  el.btnConfirmarExclusao.addEventListener('click', excluir);
  el.btnCancelarExclusao.addEventListener('click', () => {
    esconderConfirmacaoExclusao();
    el.btnExcluir.focus();
  });
  el.btnWhats.addEventListener('click', () => {
    const lead = estado.editando;
    if (!lead) return;
    // Um modal de cada vez (modal sobre modal disputa o foco no Bootstrap)
    el.modal.addEventListener('hidden.bs.modal', () => envio.abrir(lead), { once: true });
    modalLead.hide();
  });
  el.btnNota.addEventListener('click', salvarNota);
  el.notaRetorno.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-dias]');
    if (!b || !estado.editando) return;
    const data = somarDias(hojeIso(), Number(b.dataset.dias));
    const atualizado = await adiar(estado.editando.id, data);
    if (atualizado) el.form.follow_up_em.value = atualizado.follow_up_em ?? '';
  });
  el.historicoLista.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-excluir-nota]');
    if (!b) return;
    try {
      await dados.excluirNota(b.dataset.excluirNota);
      carregarHistorico(estado.editando);
    } catch (erro) {
      toast(mensagemDeErro(erro, 'Excluir anotação'), 'erro');
    }
  });
  el.modal.addEventListener('shown.bs.modal', () => (estado.editando ? f.nome : f.cnpj).focus());
}

function abrirFormulario(lead, etapaInicial = ETAPA_INICIAL) {
  const f = el.form;
  estado.editando = lead ?? null;
  f.reset();
  limparValidacao(f);
  esconderConfirmacaoExclusao();
  bootstrap.Tab.getOrCreateInstance(document.getElementById('aba-dados')).show();

  if (lead) {
    el.tituloModal.textContent = lead.nome;
    f.nome.value = lead.nome;
    f.cnpj.value = lead.cnpj ? formatarCnpj(lead.cnpj) : '';
    f.telefone.value = formatarTelefone(lead.telefone);
    f.responsavel.value = lead.responsavel ?? '';
    f.segmento.value = lead.segmento;
    f.servico.value = lead.servico ?? '';
    f.vendedor_id.value = lead.vendedor_id ?? '';
    f.etapa.value = lead.etapa;
    f.follow_up_em.value = lead.follow_up_em ?? '';
    f.email.value = lead.email ?? '';
    f.cidade.value = lead.cidade ?? '';
    f.uf.value = lead.uf ?? '';
    f.origem.value = lead.origem ?? '';
    f.observacoes.value = lead.observacoes ?? '';
    el.datas.textContent = `Criado em ${formatarDataBr(lead.criado_em)} · Na etapa desde ${formatarDataBr(lead.movido_em)}`
      + (lead.ultimo_contato_em ? ` · Último contato em ${formatarDataBr(lead.ultimo_contato_em)}` : '')
      + (lead.tentativas ? ` · ${lead.tentativas} mensagem(ns) sem resposta` : '');
    el.btnExcluir.classList.remove('d-none');
    el.btnWhats.classList.remove('d-none');
    el.abas.classList.remove('d-none');
    carregarHistorico(lead);
  } else {
    el.tituloModal.textContent = 'Novo lead';
    f.etapa.value = etapaInicial;
    f.vendedor_id.value = estado.usuario?.id ?? '';
    el.datas.textContent = '';
    el.btnExcluir.classList.add('d-none');
    el.btnWhats.classList.add('d-none');
    el.abas.classList.add('d-none');
  }
  modalLead.show();
}

function dadosDoForm() {
  return Object.fromEntries(new FormData(el.form));
}

/** Busca o CNPJ na BrasilAPI e preenche só os campos que estão vazios. */
async function buscarCnpj() {
  const f = el.form;
  if (!validarCnpj(f.cnpj.value)) {
    marcarInvalido(f, 'cnpj', 'Digite um CNPJ válido para buscar.');
    f.cnpj.focus();
    return;
  }
  const restaurar = carregando(el.btnCnpj, 'Buscando...');
  try {
    const r = await consultarCnpj(f.cnpj.value);
    const preencher = (campo, valor) => {
      if (valor && !f[campo].value.trim()) {
        f[campo].value = valor;
        limparValidacao(f, campo);
      }
    };
    preencher('nome', r.nome);
    preencher('telefone', r.telefone ? formatarTelefone(r.telefone) : '');
    preencher('responsavel', r.responsavel);
    preencher('email', r.email);
    preencher('cidade', r.cidade);
    preencher('uf', r.uf);
    preencher('segmento', r.atividade);
    if (r.razao_social && r.razao_social !== r.nome && !f.observacoes.value.includes(r.razao_social)) {
      f.observacoes.value = [f.observacoes.value.trim(), `Razão social: ${r.razao_social}`].filter(Boolean).join('\n');
    }
    if (r.situacao && normalizarTexto(r.situacao) !== 'ativa') {
      toast(`Atenção: a situação do CNPJ na Receita é "${r.situacao}".`, 'aviso');
    } else {
      toast(r.telefone ? 'Dados preenchidos pela Receita. Confira antes de salvar.'
        : 'Dados preenchidos. A Receita não tem telefone deste CNPJ: preencha na mão.', r.telefone ? 'sucesso' : 'aviso');
    }
    validarCampo('telefone');
  } catch (erro) {
    toast(erro.message, 'erro');
  } finally {
    restaurar();
  }
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
  const dono = nomeDoVendedor(lead.vendedor_id);
  return `Este ${campo} já é usado pelo lead "${lead.nome}" (etapa ${lead.etapa}${dono ? `, com ${dono}` : ''}).`;
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
  const form = dadosDoForm();
  const { erros: errosCampos, lead } = validarLead(form);
  lead.vendedor_id = form.vendedor_id || null;
  const erros = { ...duplicadosLocais(lead), ...errosCampos };
  if (Object.keys(erros).length) {
    bootstrap.Tab.getOrCreateInstance(document.getElementById('aba-dados')).show();
    mostrarErros(f, erros);
    return;
  }

  const restaurar = carregando(el.btnSalvar);
  const editando = estado.editando;
  try {
    // Confere no banco também (o sócio ou uma importação pode ter criado o mesmo dado)
    const conflitos = await leadsApi.buscarConflitos(lead, editando?.id);
    const errosBanco = {};
    if (conflitos.cnpj) errosBanco.cnpj = mensagemDuplicado('CNPJ', conflitos.cnpj);
    if (conflitos.telefone) errosBanco.telefone = mensagemDuplicado('telefone', conflitos.telefone);
    if (Object.keys(errosBanco).length) {
      mostrarErros(f, errosBanco);
      return;
    }

    // Data escolhida na mão vale mais que a cadência automática
    const manterFollowUp = Boolean(editando) && (lead.follow_up_em ?? null) !== (editando.follow_up_em ?? null);
    const salvo = editando
      ? await leadsApi.atualizarLead(editando.id, lead, editando.etapa, manterFollowUp)
      : await leadsApi.criarLead(lead);

    if (editando) substituirLead(salvo);
    else if (!acharLead(salvo.id)) estado.leads.unshift(salvo);
    render();
    modalLead.hide();
    const agendado = salvo.follow_up_em && salvo.follow_up_em !== editando?.follow_up_em && salvo.follow_up_em !== lead.follow_up_em;
    toast(`${editando ? 'Lead atualizado.' : 'Lead cadastrado.'}${agendado ? ` Retorno agendado para ${formatarDataBr(salvo.follow_up_em)}.` : ''}`, 'sucesso');
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
// Histórico do lead
// ---------------------------------------------------------------------
async function carregarHistorico(lead) {
  el.historicoLista.innerHTML = '<li class="text-body-secondary small">Carregando...</li>';
  el.historicoNum.textContent = '';
  try {
    const itens = await dados.listarHistorico(lead.id);
    if (estado.editando?.id !== lead.id) return; // trocou de lead enquanto carregava
    el.historicoNum.textContent = itens.length || '';
    renderHistorico(itens, lead);
  } catch (erro) {
    el.historicoLista.innerHTML = `<li class="text-danger small">${escapeHtml(mensagemDeErro(erro, 'Carregar histórico'))}</li>`;
  }
}

function renderHistorico(itens, lead) {
  const nome = (id) => estado.membros.find((m) => m.user_id === id)?.nome ?? '';
  const hora = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const linhas = itens.map((h) => {
    let icone = 'bi-arrow-right-circle';
    let texto = '';
    if (h.tipo === 'envio') {
      icone = 'bi-whatsapp text-success';
      texto = `Enviou mensagem${h.etapa_anterior !== h.etapa_nova ? ` (${escapeHtml(h.etapa_anterior)} → ${escapeHtml(h.etapa_nova)})` : ''}`
        + (h.mensagem_enviada ? `<details class="mt-1"><summary class="small">Ver mensagem</summary><div class="previa-msg small mt-1">${escapeHtml(h.mensagem_enviada)}</div></details>` : '');
    } else if (h.tipo === 'nota') {
      icone = 'bi-journal-text text-info';
      texto = `<div class="nota-texto">${escapeHtml(h.nota)}</div>`;
    } else {
      texto = `Moveu de <b>${escapeHtml(h.etapa_anterior ?? '—')}</b> para <b>${escapeHtml(h.etapa_nova ?? '—')}</b>`;
    }
    const podeExcluir = h.tipo === 'nota' && h.user_id === estado.usuario?.id;
    return `
      <li class="linha-tempo-item">
        <i class="bi ${icone}" aria-hidden="true"></i>
        <div class="flex-grow-1">
          <div>${texto}</div>
          <div class="small text-body-secondary">${hora(h.data)}${nome(h.user_id) ? ` · ${escapeHtml(nome(h.user_id))}` : ''}</div>
        </div>
        ${podeExcluir ? `<button type="button" class="btn btn-sm btn-link text-body-secondary" data-excluir-nota="${h.id}" title="Excluir anotação"><i class="bi bi-trash" aria-hidden="true"></i></button>` : ''}
      </li>`;
  });
  linhas.push(`
    <li class="linha-tempo-item">
      <i class="bi bi-plus-circle text-body-secondary" aria-hidden="true"></i>
      <div><div>Lead cadastrado${lead.origem ? ` (origem: ${escapeHtml(lead.origem)})` : ''}</div>
      <div class="small text-body-secondary">${hora(lead.criado_em)}</div></div>
    </li>`);
  el.historicoLista.innerHTML = linhas.join('');
}

async function salvarNota() {
  const lead = estado.editando;
  const nota = el.novaNota.value.trim();
  if (!lead || !nota) {
    el.novaNota.focus();
    return;
  }
  const restaurar = carregando(el.btnNota);
  try {
    await dados.adicionarNota(lead.id, nota);
    el.novaNota.value = '';
    await carregarHistorico(lead);
    toast('Anotação salva.', 'sucesso');
  } catch (erro) {
    toast(mensagemDeErro(erro, 'Salvar anotação'), 'erro');
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
