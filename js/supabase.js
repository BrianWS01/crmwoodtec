// Cliente Supabase único para todo o app + helper de erro.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

/**
 * Converte o erro do Supabase numa mensagem em português para o usuário.
 * Mantém o erro original no console para depuração.
 */
export function mensagemDeErro(erro, contexto = 'Operação') {
  console.error(`[${contexto}]`, erro);
  if (!erro) return `${contexto}: erro desconhecido.`;

  const msg = String(erro.message ?? '');
  if (erro.code === '23505') return `${contexto}: já existe um registro com esses dados.`;
  if (erro.code === '23514') return `${contexto}: algum campo está em formato inválido.`;
  if (erro.code === '42501' || /row-level security/i.test(msg)) return `${contexto}: sem permissão. Faça login novamente.`;
  if (erro.code === 'PGRST301' || /jwt/i.test(msg)) return 'Sua sessão expirou. Faça login novamente.';
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return `${contexto}: sem conexão com o servidor.`;
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.';
  if (/email not confirmed/i.test(msg)) return 'E-mail ainda não confirmado no Supabase.';
  return `${contexto}: ${msg || 'erro desconhecido.'}`;
}
