// Consulta de CNPJ na BrasilAPI (gratuita, sem chave) para preencher o cadastro sozinho.
// `dadosDoCnpj` é pura (testável); `consultarCnpj` faz a requisição.
import { somenteDigitos, normalizarTelefone, textoOuNull } from './validators.js';

const URL_API = 'https://brasilapi.com.br/api/cnpj/v1/';

// Palavras que ficam minúsculas no meio do nome ("Clínica DE Olhos" -> "Clínica de Olhos")
const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'a', 'o', 'para', 'com']);
// Siglas societárias que ficam maiúsculas
const SIGLAS = new Set(['ltda', 'me', 'epp', 'eireli', 's/a', 'sa', 's.a.', 'ss', 'mei']);

/** "CLINICA DE OLHOS SAO JOSE LTDA" -> "Clinica de Olhos Sao Jose LTDA" */
export function capitalizarNome(texto) {
  return String(texto ?? '').toLowerCase().trim().split(/\s+/).map((p, i) => {
    if (SIGLAS.has(p)) return p.toUpperCase();
    if (i > 0 && MINUSCULAS.has(p)) return p;
    return p ? p[0].toUpperCase() + p.slice(1) : p;
  }).join(' ');
}

/**
 * Converte a resposta da BrasilAPI nos campos do lead.
 * Usa o nome fantasia quando existe (é como o cliente conhece a empresa).
 */
export function dadosDoCnpj(r) {
  const telefones = [r.ddd_telefone_1, r.ddd_telefone_2]
    .map((t) => normalizarTelefone(somenteDigitos(t)))
    .filter(Boolean);
  // Prefere celular (9 dígitos depois do DDD): é o que tem WhatsApp
  const celular = telefones.find((t) => t.length === 13);
  const socio = r.qsa?.[0]?.nome_socio;
  return {
    nome: capitalizarNome(textoOuNull(r.nome_fantasia) ?? r.razao_social),
    razao_social: capitalizarNome(r.razao_social),
    telefone: celular ?? telefones[0] ?? null,
    email: textoOuNull(r.email)?.toLowerCase() ?? null,
    cidade: r.municipio ? capitalizarNome(r.municipio) : null,
    uf: textoOuNull(r.uf)?.toUpperCase() ?? null,
    atividade: textoOuNull(r.cnae_fiscal_descricao),
    responsavel: socio ? capitalizarNome(socio) : null,
    situacao: textoOuNull(r.descricao_situacao_cadastral),
  };
}

/** Busca o CNPJ. Lança Error com mensagem em português se não encontrar. */
export async function consultarCnpj(cnpj) {
  const d = somenteDigitos(cnpj);
  let resposta;
  try {
    resposta = await fetch(URL_API + d);
  } catch {
    throw new Error('Sem conexão com a BrasilAPI. Tente de novo em instantes.');
  }
  if (resposta.status === 404) throw new Error('CNPJ não encontrado na Receita.');
  if (resposta.status === 429) throw new Error('Muitas consultas seguidas. Espere um minuto e tente de novo.');
  if (!resposta.ok) throw new Error(`A consulta de CNPJ falhou (erro ${resposta.status}).`);
  return dadosDoCnpj(await resposta.json());
}
