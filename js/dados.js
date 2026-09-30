// Acesso ao Supabase para equipe, mensagens padrão, cadência e histórico.
// Todas as funções lançam o erro do Supabase em caso de falha; quem chama trata com try/catch.
import { supabase } from './supabase.js';

async function resultado(consulta) {
  const { data, error } = await consulta;
  if (error) throw error;
  return data;
}

// ---------------------------------------------------------------------
// Equipe
// ---------------------------------------------------------------------
export function listarMembros() {
  return resultado(supabase.from('membros').select('user_id, nome, email').order('nome'));
}

export function renomearMembro(userId, nome) {
  return resultado(supabase.from('membros').update({ nome }).eq('user_id', userId).select().single());
}

// ---------------------------------------------------------------------
// Mensagens padrão
// ---------------------------------------------------------------------
export function listarMensagens() {
  return resultado(supabase.from('mensagens_padrao').select('*').order('titulo'));
}

export function criarMensagens(lista) {
  return resultado(supabase.from('mensagens_padrao').insert(lista).select());
}

export function criarMensagem(msg) {
  return resultado(supabase.from('mensagens_padrao').insert(msg).select().single());
}

export function atualizarMensagem(id, msg) {
  return resultado(supabase.from('mensagens_padrao').update(msg).eq('id', id).select().single());
}

export function excluirMensagem(id) {
  return resultado(supabase.from('mensagens_padrao').delete().eq('id', id));
}

export function definirMensagemPadrao(id) {
  return resultado(supabase.rpc('definir_mensagem_padrao', { p_id: id }));
}

// ---------------------------------------------------------------------
// Cadência de follow-up
// ---------------------------------------------------------------------
export function listarCadencia() {
  return resultado(supabase.from('cadencia').select('etapa, dias'));
}

export function salvarCadencia(etapa, dias) {
  return resultado(supabase.from('cadencia').update({ dias }).eq('etapa', etapa));
}

// ---------------------------------------------------------------------
// Histórico
// ---------------------------------------------------------------------
export function listarHistorico(leadId) {
  return resultado(supabase.from('historico_contatos').select('*')
    .eq('lead_id', leadId).order('data', { ascending: false }).limit(200));
}

export function adicionarNota(leadId, nota) {
  return resultado(supabase.from('historico_contatos')
    .insert({ lead_id: leadId, tipo: 'nota', nota }).select().single());
}

export function excluirNota(id) {
  return resultado(supabase.from('historico_contatos').delete().eq('id', id));
}

/** Envios desde a data (para o painel). desdeIso null = tudo. */
export async function listarEnvios(desdeIso) {
  const todos = [];
  const PAGINA = 1000;
  for (let inicio = 0; ; inicio += PAGINA) {
    let q = supabase.from('historico_contatos').select('user_id, data, tipo').eq('tipo', 'envio')
      .order('data', { ascending: false }).range(inicio, inicio + PAGINA - 1);
    if (desdeIso) q = q.gte('data', desdeIso);
    const data = await resultado(q);
    todos.push(...data);
    if (data.length < PAGINA) break;
  }
  return todos;
}

// ---------------------------------------------------------------------
// Configurações da equipe (chave/valor)
// ---------------------------------------------------------------------
export async function lerConfig(chave) {
  const data = await resultado(supabase.from('configuracoes_equipe').select('valor').eq('chave', chave).maybeSingle());
  return data?.valor ?? null;
}

export function salvarConfig(chave, valor) {
  return resultado(supabase.from('configuracoes_equipe')
    .upsert({ chave, valor, atualizado_em: new Date().toISOString() }));
}
