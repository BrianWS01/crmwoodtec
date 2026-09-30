// Regras do pipeline: atraso de follow-up, tempo na etapa, "parados", filtros e ordenação.
// Módulo puro (sem DOM, sem Supabase). Datas "agora" entram por parâmetro para facilitar teste.
import { ETAPAS, ETAPAS_FINAIS, ETAPAS_PROSPECCAO, TENTATIVAS_MAX } from './constants.js';
import { hojeIso, normalizarTexto, somenteDigitos } from './validators.js';

/** A partir de quantos dias na mesma etapa o lead conta como "parado". */
export const DIAS_PARADO = 7;

/** Dias entre duas datas "AAAA-MM-DD" (ate - de). */
export function diferencaDias(deIso, ateIso) {
  const [a1, m1, d1] = deIso.split('-').map(Number);
  const [a2, m2, d2] = ateIso.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/** "Mensagem enviada" -> "mensagem-enviada" (usado em classes/atributos de CSS). */
export function slugEtapa(etapa) {
  return normalizarTexto(etapa).replace(/[^a-z0-9]+/g, '-');
}

export function etapaFinal(etapa) {
  return ETAPAS_FINAIS.includes(etapa);
}

/** Dias completos desde a última mudança de etapa. */
export function diasNaEtapa(lead, agora = new Date()) {
  if (!lead.movido_em) return 0;
  return Math.max(0, diferencaDias(hojeIso(new Date(lead.movido_em)), hojeIso(agora)));
}

/**
 * Situação do follow-up. Etapas finais (Fechado/Perdido) não geram alerta.
 * Retorna { tipo: 'atrasado', dias } | { tipo: 'hoje', dias: 0 } | { tipo: 'futuro', dias } | null
 */
export function situacaoFollowUp(lead, agora = new Date()) {
  if (!lead.follow_up_em || etapaFinal(lead.etapa)) return null;
  const dias = diferencaDias(hojeIso(agora), lead.follow_up_em);
  if (dias < 0) return { tipo: 'atrasado', dias: -dias };
  if (dias === 0) return { tipo: 'hoje', dias: 0 };
  return { tipo: 'futuro', dias };
}

export function estaParado(lead, agora = new Date()) {
  return !etapaFinal(lead.etapa) && diasNaEtapa(lead, agora) >= DIAS_PARADO;
}

/**
 * Aplica os filtros da tela.
 * filtros: { busca, segmento, servico, vendedor, situacao: null | 'atrasados' | 'hoje' | 'parados' }
 */
export function filtrarLeads(leads, filtros = {}, agora = new Date()) {
  const termo = normalizarTexto(filtros.busca);
  const digitos = somenteDigitos(filtros.busca);
  const segmento = normalizarTexto(filtros.segmento);

  return leads.filter((l) => {
    if (segmento && normalizarTexto(l.segmento) !== segmento) return false;
    if (filtros.servico && l.servico !== filtros.servico) return false;
    if (filtros.vendedor && l.vendedor_id !== filtros.vendedor) return false;

    if (filtros.situacao === 'atrasados' && situacaoFollowUp(l, agora)?.tipo !== 'atrasado') return false;
    if (filtros.situacao === 'hoje' && situacaoFollowUp(l, agora)?.tipo !== 'hoje') return false;
    if (filtros.situacao === 'parados' && !estaParado(l, agora)) return false;

    if (termo) {
      const texto = normalizarTexto(`${l.nome} ${l.responsavel ?? ''}`);
      const casaTexto = texto.includes(termo);
      const casaNumero = digitos.length >= 3 && (`${l.cnpj ?? ''}`.includes(digitos) || `${l.telefone}`.includes(digitos));
      if (!casaTexto && !casaNumero) return false;
    }
    return true;
  });
}

/**
 * Quem precisa de ação aparece primeiro:
 * 1) follow-up atrasado (o mais atrasado primeiro)  2) follow-up hoje
 * 3) follow-up futuro (o mais próximo primeiro)     4) sem follow-up (o mais tempo parado primeiro)
 */
export function ordenarPorPrioridade(leads, agora = new Date()) {
  const grupo = (l) => {
    const s = situacaoFollowUp(l, agora);
    if (!s) return 3;
    return { atrasado: 0, hoje: 1, futuro: 2 }[s.tipo];
  };
  return [...leads].sort((a, b) => {
    const ga = grupo(a);
    const gb = grupo(b);
    if (ga !== gb) return ga - gb;
    if (ga < 3) return a.follow_up_em.localeCompare(b.follow_up_em);
    return String(a.movido_em ?? '').localeCompare(String(b.movido_em ?? ''));
  });
}

/** Contadores por etapa: { [etapa]: { total, parados, atrasados } } */
export function resumoPorEtapa(leads, agora = new Date()) {
  const resumo = Object.fromEntries(ETAPAS.map((e) => [e, { total: 0, parados: 0, atrasados: 0 }]));
  for (const l of leads) {
    const r = resumo[l.etapa];
    if (!r) continue;
    r.total += 1;
    if (estaParado(l, agora)) r.parados += 1;
    if (situacaoFollowUp(l, agora)?.tipo === 'atrasado') r.atrasados += 1;
  }
  return resumo;
}

/** Contadores das "situações" (chips de filtro rápido). */
export function contarSituacoes(leads, agora = new Date()) {
  let atrasados = 0;
  let hoje = 0;
  let parados = 0;
  for (const l of leads) {
    const s = situacaoFollowUp(l, agora);
    if (s?.tipo === 'atrasado') atrasados += 1;
    if (s?.tipo === 'hoje') hoje += 1;
    if (estaParado(l, agora)) parados += 1;
  }
  return { atrasados, hoje, parados };
}

/** Inicial para o avatar do card. */
export function inicial(nome) {
  const m = String(nome ?? '').trim().match(/[\p{L}\p{N}]/u);
  return m ? m[0].toUpperCase() : '?';
}

/** Matiz (0–359) estável a partir do nome, para a cor do avatar. */
export function matizDoNome(nome) {
  let h = 0;
  for (const c of String(nome ?? '')) h = (h * 31 + c.codePointAt(0)) % 360;
  return h;
}

// ---------------------------------------------------------------------
// Fila do dia
// ---------------------------------------------------------------------

/** Mandou TENTATIVAS_MAX mensagens e nada de resposta: hora de pensar em "Perdido". */
export function sugerirPerdido(lead) {
  return ETAPAS_PROSPECCAO.includes(lead.etapa) && (lead.tentativas ?? 0) >= TENTATIVAS_MAX;
}

/** Soma dias a uma data "AAAA-MM-DD". */
export function somarDias(iso, dias) {
  const [a, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

/**
 * Monta a fila do dia. Cada lead cai em um grupo só, na ordem:
 *   atrasados  follow-up vencido (o mais atrasado primeiro)
 *   hoje       follow-up marcado para hoje
 *   novos      em "Novo", nunca contatados e sem follow-up (o mais antigo primeiro)
 *   esquecidos parados há DIAS_PARADO+ dias e sem follow-up nenhum (o mais parado primeiro)
 * Fechado e Perdido nunca entram.
 */
export function montarFila(leads, agora = new Date()) {
  const fila = { atrasados: [], hoje: [], novos: [], esquecidos: [] };
  for (const l of leads) {
    if (etapaFinal(l.etapa)) continue;
    const fu = situacaoFollowUp(l, agora);
    if (fu?.tipo === 'atrasado') fila.atrasados.push(l);
    else if (fu?.tipo === 'hoje') fila.hoje.push(l);
    else if (fu) continue; // follow-up futuro: está agendado, não precisa de nada hoje
    else if (l.etapa === 'Novo' && !l.ultimo_contato_em) fila.novos.push(l);
    else if (estaParado(l, agora)) fila.esquecidos.push(l);
  }
  const porData = (campo) => (a, b) => String(a[campo] ?? '').localeCompare(String(b[campo] ?? ''));
  fila.atrasados.sort(porData('follow_up_em'));
  fila.hoje.sort(porData('movido_em'));
  fila.novos.sort(porData('criado_em'));
  fila.esquecidos.sort(porData('movido_em'));
  return fila;
}

/** Total de itens da fila. */
export function totalFila(fila) {
  return fila.atrasados.length + fila.hoje.length + fila.novos.length + fila.esquecidos.length;
}
