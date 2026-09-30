// Configurações: modelos de mensagem, cadência de follow-up e equipe.
import { ETAPAS, ETAPAS_FINAIS, SERVICOS, VARIAVEIS_MENSAGEM } from './constants.js';
import { montarMensagem, variaveisDesconhecidas } from './mensagens.js';
import { MODELOS_SUGERIDOS } from './modelos-sugeridos.js';
import { textoOuNull } from './validators.js';
import * as dados from './dados.js';
import { mensagemDeErro } from './supabase.js';
import { escapeHtml, toast, carregando, confirmar } from './ui.js';

const LEAD_EXEMPLO = {
  nome: 'Clínica Sorriso', responsavel: 'Ana Paula', segmento: 'Clínica odontológica',
  servico: 'Landing page', cidade: 'Campinas', etapa: 'Novo',
};

const DICA_CADENCIA = {
  'Novo': 'Lead recém-cadastrado. Deixe vazio para ele aparecer em "Novos para abordar".',
  'Mensagem enviada': 'Depois da 1ª mensagem (e de cada nova tentativa), quando cobrar de novo.',
  'Respondeu': 'Quando voltar a falar depois que ele respondeu.',
  'Reunião marcada': 'Normalmente vazio: coloque a data da reunião no follow-up na mão.',
  'Proposta enviada': 'Quando cobrar um retorno da proposta.',
};

/**
 * estado: { mensagens(), setMensagens(lista), membros(), setMembros(lista), usuarioId(), nomeUsuario() }
 */
export function criarConfiguracoes(estado) {
  const el = {
    modal: document.getElementById('modal-config'),
    mensagens: document.getElementById('cfg-mensagens'),
    cadencia: document.getElementById('cfg-cadencia'),
    equipe: document.getElementById('cfg-equipe'),
  };
  const modal = new bootstrap.Modal(el.modal);
  let editando = null; // mensagem aberta no editor (objeto) | 'nova' | null

  async function abrir(aba = 'mensagens') {
    editando = null;
    renderMensagens();
    renderEquipe();
    el.cadencia.innerHTML = '<div class="text-center py-4"><div class="spinner-border spinner-border-sm"></div></div>';
    modal.show();
    bootstrap.Tab.getOrCreateInstance(el.modal.querySelector(`[data-bs-target="#cfg-${aba}"]`)).show();
    try {
      renderCadencia(await dados.listarCadencia());
    } catch (erro) {
      el.cadencia.innerHTML = `<div class="alert alert-danger">${escapeHtml(mensagemDeErro(erro, 'Carregar cadência'))}</div>`;
    }
  }

  // ---------------------------------------------------------------
  // Mensagens
  // ---------------------------------------------------------------
  function renderMensagens() {
    if (editando) return renderEditor();
    const lista = estado.mensagens();
    el.mensagens.innerHTML = `
      <p class="small text-body-secondary">
        Ao clicar em <b>Enviar</b>, o CRM escolhe sozinho o modelo mais específico para o lead
        (etapa → segmento → serviço). Sem nenhum compatível, usa o <b>padrão</b>.
      </p>
      ${lista.length ? `<div class="list-group mb-3">
        ${lista.map((m) => `
          <div class="list-group-item d-flex gap-2 align-items-start">
            <div class="flex-grow-1 min-w-0">
              <div class="fw-semibold">${escapeHtml(m.titulo)} ${m.padrao ? '<span class="badge text-bg-primary">padrão</span>' : ''}</div>
              <div class="small text-body-secondary">${gatilhos(m)}</div>
              <div class="small text-truncate">${escapeHtml(m.texto)}</div>
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary" data-editar="${m.id}"><i class="bi bi-pencil" aria-hidden="true"></i><span class="visually-hidden">Editar</span></button>
          </div>`).join('')}
      </div>` : '<div class="alert alert-info">Nenhum modelo ainda. Crie o primeiro: ele vira o padrão.</div>'}
      <button type="button" class="btn btn-success btn-sm" id="cfg-nova-msg"><i class="bi bi-plus-lg me-1" aria-hidden="true"></i>Novo modelo</button>
      <button type="button" class="btn btn-outline-secondary btn-sm ms-1" id="cfg-sugestoes" title="Cria modelos prontos (1º contato por segmento e serviço, cobrança, proposta...) para você ajustar">
        <i class="bi bi-magic me-1" aria-hidden="true"></i>Criar modelos sugeridos</button>`;

    el.mensagens.querySelector('#cfg-nova-msg').addEventListener('click', () => { editando = 'nova'; renderEditor(); });
    el.mensagens.querySelector('#cfg-sugestoes').addEventListener('click', criarSugestoes);
    el.mensagens.querySelectorAll('[data-editar]').forEach((b) => b.addEventListener('click', () => {
      editando = lista.find((m) => m.id === b.dataset.editar);
      renderEditor();
    }));
  }

  function gatilhos(m) {
    const g = [];
    if (m.etapa_gatilho) g.push(`Etapa: ${escapeHtml(m.etapa_gatilho)}`);
    if (m.segmento_gatilho) g.push(`Segmento: ${escapeHtml(m.segmento_gatilho)}`);
    if (m.servico_gatilho) g.push(`Serviço: ${escapeHtml(m.servico_gatilho)}`);
    return g.length ? g.join(' · ') : 'Qualquer lead';
  }

  function renderEditor() {
    const m = editando === 'nova' ? { titulo: '', texto: '', padrao: !estado.mensagens().length } : editando;
    const opcoes = (lista, sel, vazio) => `<option value="">${vazio}</option>`
      + lista.map((v) => `<option ${sel === v ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('');

    el.mensagens.innerHTML = `
      <form id="cfg-form-msg" novalidate>
        <div class="mb-2">
          <label class="form-label small" for="msg-titulo">Nome do modelo</label>
          <input class="form-control" id="msg-titulo" name="titulo" maxlength="80" required value="${escapeHtml(m.titulo)}" placeholder="Ex.: 1º contato — clínicas">
        </div>
        <div class="mb-1">
          <label class="form-label small" for="msg-texto">Texto</label>
          <textarea class="form-control" id="msg-texto" name="texto" rows="7" required>${escapeHtml(m.texto)}</textarea>
        </div>
        <div class="d-flex flex-wrap gap-1 mb-3" aria-label="Inserir variável">
          ${VARIAVEIS_MENSAGEM.map(([v, d]) => `<button type="button" class="btn btn-sm btn-outline-secondary py-0" data-variavel="${v}" title="${escapeHtml(d)}">${v}</button>`).join('')}
        </div>
        <p class="small fw-semibold mb-1">Usar este modelo quando (deixe vazio para qualquer um):</p>
        <div class="row g-2 mb-3">
          <div class="col-12 col-md-4">
            <label class="form-label small" for="msg-etapa">Etapa</label>
            <select class="form-select form-select-sm" id="msg-etapa" name="etapa_gatilho">${opcoes(ETAPAS.filter((e) => !ETAPAS_FINAIS.includes(e)), m.etapa_gatilho, 'Qualquer etapa')}</select>
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label small" for="msg-segmento">Segmento</label>
            <input class="form-control form-control-sm" id="msg-segmento" name="segmento_gatilho" list="lista-segmentos" value="${escapeHtml(m.segmento_gatilho ?? '')}" placeholder="Qualquer segmento">
          </div>
          <div class="col-12 col-md-4">
            <label class="form-label small" for="msg-servico">Serviço</label>
            <select class="form-select form-select-sm" id="msg-servico" name="servico_gatilho">${opcoes(SERVICOS, m.servico_gatilho, 'Qualquer serviço')}</select>
          </div>
        </div>
        <div class="form-check mb-3">
          <input class="form-check-input" type="checkbox" id="msg-padrao" name="padrao" ${m.padrao ? 'checked' : ''}>
          <label class="form-check-label" for="msg-padrao">Modelo padrão (usado quando nenhum outro combina)</label>
        </div>
        <p class="small fw-semibold mb-1">Como fica (exemplo: ${escapeHtml(LEAD_EXEMPLO.nome)}):</p>
        <div class="previa-msg mb-1" id="msg-previa"></div>
        <p class="small mb-3" id="msg-aviso"></p>
        <div class="d-flex gap-2">
          ${m.id ? '<button type="button" class="btn btn-outline-danger btn-sm me-auto" id="msg-excluir"><i class="bi bi-trash me-1" aria-hidden="true"></i>Excluir</button>' : '<span class="me-auto"></span>'}
          <button type="button" class="btn btn-outline-secondary btn-sm" id="msg-cancelar">Voltar</button>
          <button type="submit" class="btn btn-success btn-sm" id="msg-salvar"><i class="bi bi-check-lg me-1" aria-hidden="true"></i>Salvar</button>
        </div>
      </form>`;

    const f = el.mensagens.querySelector('#cfg-form-msg');
    const previa = () => {
      el.mensagens.querySelector('#msg-previa').textContent = montarMensagem(f.texto.value, LEAD_EXEMPLO, { vendedor: estado.nomeUsuario() }) || '—';
      const desc = variaveisDesconhecidas(f.texto.value);
      el.mensagens.querySelector('#msg-aviso').innerHTML = desc.length
        ? `<span class="text-warning-emphasis">Variável não reconhecida: ${desc.map((v) => `<code>{${escapeHtml(v)}}</code>`).join(', ')}</span>` : '';
    };
    f.texto.addEventListener('input', previa);
    el.mensagens.querySelectorAll('[data-variavel]').forEach((b) => b.addEventListener('click', () => {
      const t = f.texto;
      const [ini, fim] = [t.selectionStart, t.selectionEnd];
      t.value = t.value.slice(0, ini) + b.dataset.variavel + t.value.slice(fim);
      t.focus();
      t.selectionStart = t.selectionEnd = ini + b.dataset.variavel.length;
      previa();
    }));
    el.mensagens.querySelector('#msg-cancelar').addEventListener('click', () => { editando = null; renderMensagens(); });
    el.mensagens.querySelector('#msg-excluir')?.addEventListener('click', () => excluirMensagem(m));
    f.addEventListener('submit', (ev) => { ev.preventDefault(); salvarMensagem(f, m); });
    previa();
  }

  async function salvarMensagem(f, original) {
    const msg = {
      titulo: textoOuNull(f.titulo.value),
      texto: textoOuNull(f.texto.value),
      etapa_gatilho: textoOuNull(f.etapa_gatilho.value),
      segmento_gatilho: textoOuNull(f.segmento_gatilho.value),
      servico_gatilho: textoOuNull(f.servico_gatilho.value),
    };
    if (!msg.titulo || !msg.texto) {
      f.classList.add('was-validated');
      return;
    }
    const querPadrao = f.padrao.checked;
    const restaurar = carregando(el.mensagens.querySelector('#msg-salvar'));
    try {
      const salva = original.id ? await dados.atualizarMensagem(original.id, msg) : await dados.criarMensagem(msg);
      if (querPadrao && !original.padrao) await dados.definirMensagemPadrao(salva.id);
      if (!querPadrao && original.padrao) await dados.atualizarMensagem(salva.id, { padrao: false });
      estado.setMensagens(await dados.listarMensagens());
      editando = null;
      renderMensagens();
      toast('Modelo salvo.', 'sucesso');
    } catch (erro) {
      toast(mensagemDeErro(erro, 'Salvar modelo'), 'erro');
    } finally {
      restaurar();
    }
  }

  async function excluirMensagem(m) {
    if (!await confirmar({ titulo: 'Excluir modelo', mensagem: `Excluir "${m.titulo}"?`, textoBotao: 'Excluir', perigo: true })) return;
    try {
      await dados.excluirMensagem(m.id);
      estado.setMensagens(estado.mensagens().filter((x) => x.id !== m.id));
      editando = null;
      renderMensagens();
      toast('Modelo excluído.', 'sucesso');
    } catch (erro) {
      toast(mensagemDeErro(erro, 'Excluir modelo'), 'erro');
    }
  }

  async function criarSugestoes() {
    const botao = el.mensagens.querySelector('#cfg-sugestoes');
    const restaurar = carregando(botao, 'Criando...');
    try {
      const existentes = new Set(estado.mensagens().map((m) => m.titulo));
      const novas = MODELOS_SUGERIDOS.filter((x) => !existentes.has(x.titulo));
      // "padrao" passa pela RPC (só pode haver um); o resto vai num insert só
      const criadas = novas.length ? await dados.criarMensagens(novas.map(({ padrao, ...m }) => m)) : [];
      const padrao = criadas.find((c) => novas.find((n) => n.titulo === c.titulo)?.padrao);
      if (padrao && !estado.mensagens().some((m) => m.padrao)) await dados.definirMensagemPadrao(padrao.id);
      estado.setMensagens(await dados.listarMensagens());
      renderMensagens();
      toast(criadas.length ? `${criadas.length} modelos criados. Ajuste o texto do jeito de vocês.` : 'Os modelos sugeridos já existem.', 'sucesso');
    } catch (erro) {
      toast(mensagemDeErro(erro, 'Criar modelos'), 'erro');
      restaurar();
    }
  }

  // ---------------------------------------------------------------
  // Cadência
  // ---------------------------------------------------------------
  function renderCadencia(linhas) {
    const dias = Object.fromEntries(linhas.map((l) => [l.etapa, l.dias]));
    const etapas = ETAPAS.filter((e) => !ETAPAS_FINAIS.includes(e));
    el.cadencia.innerHTML = `
      <p class="small text-body-secondary">
        Quando um lead entra numa etapa (ou recebe uma mensagem pelo CRM), o próximo retorno é agendado sozinho
        para daqui a <b>N dias</b>. Vazio = não agenda. Fechado e Perdido nunca têm retorno.
      </p>
      <form id="cfg-form-cadencia">
        ${etapas.map((e) => `
          <div class="row g-2 align-items-center mb-2">
            <label class="col-12 col-sm-4 col-form-label fw-semibold" for="cad-${e}">${escapeHtml(e)}</label>
            <div class="col-5 col-sm-3">
              <div class="input-group input-group-sm">
                <input type="number" min="0" max="90" class="form-control" id="cad-${e}" data-etapa="${escapeHtml(e)}" value="${dias[e] ?? ''}" placeholder="—">
                <span class="input-group-text">dias</span>
              </div>
            </div>
            <div class="col-12 col-sm-5 small text-body-secondary">${escapeHtml(DICA_CADENCIA[e] ?? '')}</div>
          </div>`).join('')}
        <button type="submit" class="btn btn-success btn-sm mt-2" id="cad-salvar"><i class="bi bi-check-lg me-1" aria-hidden="true"></i>Salvar cadência</button>
      </form>`;

    el.cadencia.querySelector('form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const restaurar = carregando(el.cadencia.querySelector('#cad-salvar'));
      try {
        for (const input of el.cadencia.querySelectorAll('[data-etapa]')) {
          const v = input.value.trim() === '' ? null : Math.min(90, Math.max(0, Math.round(Number(input.value))));
          if (v !== (dias[input.dataset.etapa] ?? null)) await dados.salvarCadencia(input.dataset.etapa, v);
        }
        renderCadencia(await dados.listarCadencia());
        toast('Cadência salva. Vale para as próximas mudanças de etapa.', 'sucesso');
      } catch (erro) {
        toast(mensagemDeErro(erro, 'Salvar cadência'), 'erro');
        restaurar();
      }
    });
  }

  // ---------------------------------------------------------------
  // Equipe
  // ---------------------------------------------------------------
  function renderEquipe() {
    const eu = estado.usuarioId();
    el.equipe.innerHTML = `
      <ul class="list-group mb-3">
        ${estado.membros().map((m) => `
          <li class="list-group-item d-flex align-items-center gap-2">
            <i class="bi bi-person-circle fs-5" aria-hidden="true"></i>
            <div class="flex-grow-1">
              ${m.user_id === eu
                ? `<div class="input-group input-group-sm" style="max-width:320px">
                     <input class="form-control" id="meu-nome" value="${escapeHtml(m.nome)}" maxlength="60" aria-label="Seu nome">
                     <button class="btn btn-outline-primary" type="button" id="salvar-nome">Salvar</button>
                   </div>`
                : `<span class="fw-semibold">${escapeHtml(m.nome)}</span>`}
              <div class="small text-body-secondary">${escapeHtml(m.email ?? '')}${m.user_id === eu ? ' · você' : ''}</div>
            </div>
          </li>`).join('')}
      </ul>
      <div class="alert alert-secondary small mb-0">
        <b>Para adicionar alguém:</b> no Supabase, vá em <b>Authentication → Users → Add user</b>, informe e-mail e senha
        e marque <b>Auto Confirm User</b>. A pessoa entra na equipe sozinha e passa a ver todos os leads.
        O nome que aparece aqui é o que vai na mensagem como <code>{vendedor}</code>.
      </div>`;

    el.equipe.querySelector('#salvar-nome')?.addEventListener('click', async (ev) => {
      const nome = textoOuNull(el.equipe.querySelector('#meu-nome').value);
      if (!nome) return;
      const restaurar = carregando(ev.currentTarget);
      try {
        await dados.renomearMembro(eu, nome);
        estado.setMembros(await dados.listarMembros());
        renderEquipe();
        toast('Nome atualizado.', 'sucesso');
      } catch (erro) {
        toast(mensagemDeErro(erro, 'Salvar nome'), 'erro');
        restaurar();
      }
    });
  }

  return { abrir };
}
