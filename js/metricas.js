// Números do painel de resultados. Módulo puro (sem DOM, sem Supabase).
import { ETAPAS } from './constants.js';
import { diferencaDias } from './regras.js';
import { hojeIso, normalizarTexto } from './validators.js';

/** Data ISO de N dias atrás (null = desde sempre). */
export function inicioDoPeriodo(dias, agora = new Date()) {
  if (!dias) return null;
  const d = new Date(agora);
  d.setDate(d.getDate() - dias);
  return hojeIso(d);
}

const noPeriodo = (valor, desde) => Boolean(valor) && (!desde || hojeIso(new Date(valor)) >= desde);

/** % com uma casa, ou null se não há base. */
export function taxa(parte, total) {
  return total ? Math.round((parte / total) * 1000) / 10 : null;
}

/**
 * Agrupa leads por uma chave (origem, segmento...) e conta fechados/perdidos.
 * Retorna [{ nome, total, fechados, perdidos, taxa }] do maior para o menor.
 */
export function agruparPor(leads, campo, rotuloVazio = 'Não informado') {
  const grupos = new Map();
  for (const l of leads) {
    const nome = String(l[campo] ?? '').trim() || rotuloVazio;
    const chave = normalizarTexto(nome);
    const g = grupos.get(chave) ?? { nome, total: 0, fechados: 0, perdidos: 0 };
    g.total += 1;
    if (l.etapa === 'Fechado') g.fechados += 1;
    if (l.etapa === 'Perdido') g.perdidos += 1;
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, taxa: taxa(g.fechados, g.fechados + g.perdidos) }))
    .sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/**
 * Métricas do período.
 *   leads     todos os leads
 *   historico linhas de historico_contatos (tipo, user_id, data) do período
 *   membros   [{ user_id, nome }]
 *   dias      tamanho do período (null = tudo)
 */
export function calcularMetricas({ leads, historico = [], membros = [], dias = 30, agora = new Date() }) {
  const desde = inicioDoPeriodo(dias, agora);
  const criados = leads.filter((l) => noPeriodo(l.criado_em, desde));
  const fechados = leads.filter((l) => l.etapa === 'Fechado' && noPeriodo(l.movido_em, desde));
  const perdidos = leads.filter((l) => l.etapa === 'Perdido' && noPeriodo(l.movido_em, desde));
  const ativos = leads.filter((l) => l.etapa !== 'Fechado' && l.etapa !== 'Perdido');

  const ciclos = fechados.map((l) => diferencaDias(hojeIso(new Date(l.criado_em)), hojeIso(new Date(l.movido_em))));
  const cicloMedio = ciclos.length ? Math.round(ciclos.reduce((a, b) => a + b, 0) / ciclos.length) : null;

  const funil = ETAPAS.map((etapa) => ({ etapa, total: leads.filter((l) => l.etapa === etapa).length }));

  const envios = historico.filter((h) => h.tipo === 'envio' && noPeriodo(h.data, desde));
  const nomes = new Map(membros.map((m) => [m.user_id, m.nome]));
  const porMembro = new Map(membros.map((m) => [m.user_id, { nome: m.nome, envios: 0, fechados: 0 }]));
  const linha = (id) => {
    if (!porMembro.has(id)) porMembro.set(id, { nome: nomes.get(id) ?? 'Sem vendedor', envios: 0, fechados: 0 });
    return porMembro.get(id);
  };
  for (const h of envios) linha(h.user_id).envios += 1;
  for (const l of fechados) linha(l.vendedor_id ?? null).fechados += 1;

  return {
    desde,
    novos: criados.length,
    ativos: ativos.length,
    fechados: fechados.length,
    perdidos: perdidos.length,
    envios: envios.length,
    conversao: taxa(fechados.length, fechados.length + perdidos.length),
    cicloMedio,
    funil,
    porOrigem: agruparPor(criados, 'origem'),
    porSegmento: agruparPor(criados, 'segmento'),
    porMembro: [...porMembro.values()].filter((m) => m.envios || m.fechados || membros.some((x) => x.nome === m.nome)),
  };
}
