// Modal de envio de WhatsApp: escolhe o modelo certo, monta o texto e registra o envio.
import { escolherMensagem, montarMensagem, linkWhatsApp, variaveisDesconhecidas } from './mensagens.js';
import { MODELOS_SUGERIDOS, MODELO_LIVRE } from './modelos-sugeridos.js';
import { formatarTelefone } from './validators.js';
import { sugerirPerdido } from './regras.js';
import { escapeHtml, carregando } from './ui.js';

// Modelos prontos ficam sempre na lista; um modelo da equipe com o mesmo título substitui o pronto
const PREFIXO_PRONTO = '__pronto_';
function modelosProntos(daEquipe) {
  const titulos = new Set(daEquipe.map((m) => m.titulo));
  const temPadrao = daEquipe.some((m) => m.padrao);
  return MODELOS_SUGERIDOS
    .map((m, i) => ({ ...m, id: `${PREFIXO_PRONTO}${i}`, padrao: m.padrao && !temPadrao }))
    .filter((m) => !titulos.has(m.titulo));
}

/**
 * dependencias:
 *   mensagens()           lista atual de modelos
 *   nomeUsuario()         nome de quem envia (para {vendedor})
 *   registrar(id, texto)  grava o envio no banco e devolve o lead atualizado (ou null se falhar)
 *   onRegistrado(lead)    atualiza a tela
 */
export function criarEnvio({ mensagens, nomeUsuario, registrar, onRegistrado }) {
  const el = {
    modal: document.getElementById('modal-envio'),
    nome: document.getElementById('envio-lead-nome'),
    info: document.getElementById('envio-lead-info'),
    alerta: document.getElementById('envio-alerta'),
    modelo: document.getElementById('envio-modelo'),
    texto: document.getElementById('envio-texto'),
    dica: document.getElementById('envio-dica'),
    soAbrir: document.getElementById('envio-so-abrir'),
    confirmar: document.getElementById('envio-confirmar'),
  };
  const modal = new bootstrap.Modal(el.modal);
  let leadAtual = null;
  let modelos = [];

  const montar = (modelo) => montarMensagem(modelo.texto, leadAtual, { vendedor: nomeUsuario() });

  function atualizarDica() {
    const desconhecidas = variaveisDesconhecidas(el.texto.value);
    el.dica.innerHTML = desconhecidas.length
      ? `<span class="text-warning-emphasis">Variável não reconhecida: ${desconhecidas.map((v) => `<code>{${escapeHtml(v)}}</code>`).join(', ')}.</span>`
      : `${el.texto.value.length} caracteres. Ao confirmar, o WhatsApp abre com o texto e o CRM agenda o próximo retorno.`;
    el.soAbrir.href = linkWhatsApp(leadAtual.telefone);
  }

  el.modelo.addEventListener('change', () => {
    const m = modelos.find((x) => String(x.id) === el.modelo.value) ?? modelos[0];
    el.texto.value = montar(m);
    atualizarDica();
    if (m.id === MODELO_LIVRE.id) {
      el.texto.focus();
      el.texto.selectionStart = el.texto.selectionEnd = el.texto.value.length;
    }
  });
  el.texto.addEventListener('input', atualizarDica);

  el.confirmar.addEventListener('click', async () => {
    const texto = el.texto.value.trim();
    if (!texto) {
      el.texto.focus();
      return;
    }
    // Abre a aba já no clique (se abrir depois do await, o navegador bloqueia como pop-up)
    window.open(linkWhatsApp(leadAtual.telefone, texto), '_blank', 'noopener');
    const restaurar = carregando(el.confirmar, 'Registrando...');
    try {
      const atualizado = await registrar(leadAtual.id, texto); // null = falhou (quem registra mostra o erro)
      if (atualizado) {
        modal.hide();
        onRegistrado(atualizado);
      }
    } finally {
      restaurar();
    }
  });

  function abrir(lead) {
    leadAtual = lead;
    const daEquipe = mensagens();
    modelos = [...daEquipe, ...modelosProntos(daEquipe), MODELO_LIVRE];
    // Os da equipe vêm primeiro: em empate de pontos, eles vencem os prontos
    const escolhida = escolherMensagem(modelos.filter((m) => m !== MODELO_LIVRE), lead) ?? modelos[0];

    el.nome.textContent = lead.nome;
    el.info.textContent = `${formatarTelefone(lead.telefone)} · ${lead.etapa}`;
    const opcao = (m) => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.titulo)}${m.padrao ? ' (padrão)' : ''}</option>`;
    const prontos = modelos.filter((m) => String(m.id).startsWith(PREFIXO_PRONTO));
    el.modelo.innerHTML = [
      daEquipe.length ? `<optgroup label="Modelos da equipe">${daEquipe.map(opcao).join('')}</optgroup>` : '',
      prontos.length ? `<optgroup label="Modelos prontos">${prontos.map(opcao).join('')}</optgroup>` : '',
      `<optgroup label="Escrever">${opcao(MODELO_LIVRE)}</optgroup>`,
    ].join('');
    el.modelo.value = String(escolhida.id);
    el.texto.value = montar(escolhida);

    const avisos = [];
    if (sugerirPerdido(lead)) avisos.push(`Já foram ${lead.tentativas} mensagens sem resposta. Talvez seja hora de marcar como perdido.`);
    el.alerta.innerHTML = avisos.map(escapeHtml).join('<br>');
    el.alerta.classList.toggle('d-none', !avisos.length);

    atualizarDica();
    modal.show();
  }

  return { abrir };
}
