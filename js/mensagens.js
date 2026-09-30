// Mensagens de WhatsApp: variáveis, saudação automática e escolha do modelo certo para o lead.
// Módulo puro (sem DOM, sem Supabase).
import { chaveTexto, normalizarTexto } from './validators.js';

/** "Bom dia" até 11h59, "Boa tarde" até 17h59, depois "Boa noite". */
export function saudacao(agora = new Date()) {
  const h = agora.getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** "maria clara souza" -> "Maria". */
export function primeiroNome(nome) {
  const p = String(nome ?? '').trim().split(/\s+/)[0] ?? '';
  return p ? p[0].toUpperCase() + p.slice(1) : '';
}

/** Valores das variáveis para um lead. Chaves já passadas por chaveTexto(). */
export function variaveisDoLead(lead, { agora = new Date(), vendedor = '' } = {}) {
  return {
    saudacao: saudacao(agora),
    responsavel: primeiroNome(lead.responsavel),
    nome: lead.nome ?? '',
    empresa: lead.nome ?? '',
    segmento: lead.segmento ?? '',
    servico: lead.servico ?? '',
    cidade: lead.cidade ?? '',
    vendedor: primeiroNome(vendedor),
  };
}

/**
 * Troca {variaveis} pelos dados do lead. Aceita acento e maiúscula ({Responsável}).
 * Variável vazia some junto com a vírgula/espaço antes dela:
 *   "Olá, {responsavel}! Tudo bem?" sem responsável -> "Olá! Tudo bem?"
 * Variável desconhecida fica como está (para o usuário perceber o erro de digitação).
 */
export function montarMensagem(texto, lead, opcoes = {}) {
  const vars = variaveisDoLead(lead, opcoes);
  return String(texto ?? '').replace(/(,[ \t]*|[ \t]+)?\{([^{}\n]+)\}/g, (trecho, antes, nome) => {
    const chave = chaveTexto(nome);
    if (!(chave in vars)) return trecho;
    const valor = vars[chave];
    return valor ? `${antes ?? ''}${valor}` : '';
  });
}

/** Variáveis usadas no texto que o CRM não conhece (para avisar no editor). */
export function variaveisDesconhecidas(texto) {
  const conhecidas = new Set(Object.keys(variaveisDoLead({})));
  const achadas = [...String(texto ?? '').matchAll(/\{([^{}\n]+)\}/g)].map((m) => m[1]);
  return [...new Set(achadas.filter((v) => !conhecidas.has(chaveTexto(v))))];
}

/**
 * Escolhe o modelo mais específico para o lead.
 * Gatilho preenchido que não bate com o lead exclui o modelo.
 * Pontos: etapa 4, segmento 2, serviço 1; a mensagem padrão desempata.
 * Sem nenhum compatível, devolve a padrão (ou a primeira). Lista vazia: null.
 */
export function escolherMensagem(mensagens, lead) {
  if (!mensagens?.length) return null;
  let melhor = null;
  let melhorPontos = -1;
  for (const m of mensagens) {
    let pontos = m.padrao ? 0.5 : 0;
    if (m.etapa_gatilho) {
      if (m.etapa_gatilho !== lead.etapa) continue;
      pontos += 4;
    }
    if (m.segmento_gatilho) {
      if (normalizarTexto(m.segmento_gatilho) !== normalizarTexto(lead.segmento)) continue;
      pontos += 2;
    }
    if (m.servico_gatilho) {
      if (m.servico_gatilho !== lead.servico) continue;
      pontos += 1;
    }
    if (pontos > melhorPontos) {
      melhor = m;
      melhorPontos = pontos;
    }
  }
  return melhor ?? mensagens.find((m) => m.padrao) ?? mensagens[0];
}

/** Link do WhatsApp com o texto já preenchido. */
export function linkWhatsApp(telefone, texto = '') {
  const base = `https://wa.me/${String(telefone ?? '').replace(/\D/g, '')}`;
  return texto ? `${base}?text=${encodeURIComponent(texto)}` : base;
}
