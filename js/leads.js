// CRUD de leads no Supabase. Todas as funções lançam o erro do Supabase em caso de falha;
// quem chama trata com try/catch e mostra o toast.
import { supabase } from './supabase.js';

const TABELA = 'leads';
const TAMANHO_PAGINA = 1000; // limite padrão de linhas por requisição do Supabase

/** Todos os leads do usuário (RLS já filtra), mais recentes primeiro. */
export async function listarLeads() {
  const todos = [];
  for (let inicio = 0; ; inicio += TAMANHO_PAGINA) {
    const { data, error } = await supabase
      .from(TABELA)
      .select('*')
      .order('criado_em', { ascending: false })
      .order('id')
      .range(inicio, inicio + TAMANHO_PAGINA - 1);
    if (error) throw error;
    todos.push(...data);
    if (data.length < TAMANHO_PAGINA) break;
  }
  return todos;
}

export async function criarLead(lead) {
  const { data, error } = await supabase.from(TABELA).insert(lead).select().single();
  if (error) throw error;
  return data;
}

/**
 * Atualiza um lead. Se a etapa mudou, a troca passa pela RPC mover_lead,
 * que grava movido_em e registra no histórico na mesma transação.
 */
export async function atualizarLead(id, lead, etapaAnterior) {
  const { etapa, ...campos } = lead;
  const { data, error } = await supabase.from(TABELA).update(campos).eq('id', id).select().single();
  if (error) throw error;
  if (etapa && etapa !== etapaAnterior) return moverLead(id, etapa);
  return data;
}

/** Move o lead de etapa (RPC atômica: etapa + movido_em + histórico). */
export async function moverLead(id, etapa) {
  const { data, error } = await supabase.rpc('mover_lead', { p_lead_id: id, p_etapa: etapa });
  if (error) throw error;
  return data;
}

export async function excluirLead(id) {
  const { error } = await supabase.from(TABELA).delete().eq('id', id);
  if (error) throw error;
}

/**
 * Procura no banco leads que já usam o CNPJ ou o telefone informados.
 * Retorna { cnpj: lead|null, telefone: lead|null }.
 * cnpj e telefone chegam normalizados (só dígitos), então é seguro montar o filtro.
 */
export async function buscarConflitos({ cnpj, telefone }, ignorarId = null) {
  const filtros = [];
  if (cnpj) filtros.push(`cnpj.eq.${cnpj}`);
  if (telefone) filtros.push(`telefone.eq.${telefone}`);
  if (!filtros.length) return { cnpj: null, telefone: null };

  let consulta = supabase.from(TABELA).select('id, nome, etapa, cnpj, telefone').or(filtros.join(','));
  if (ignorarId) consulta = consulta.neq('id', ignorarId);
  const { data, error } = await consulta;
  if (error) throw error;

  return {
    cnpj: (cnpj && data.find((l) => l.cnpj === cnpj)) || null,
    telefone: (telefone && data.find((l) => l.telefone === telefone)) || null,
  };
}
