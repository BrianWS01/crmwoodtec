// Validações e normalizações. Módulo puro (sem DOM, sem Supabase).
import { ETAPAS, ETAPA_INICIAL, SERVICOS, INDICE_CNPJ, INDICE_TELEFONE } from './constants.js';

// ---------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------

export function somenteDigitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

/** Minúsculas, sem acento, espaços colapsados. Ex.: "  Clínica  Médica " -> "clinica medica" */
export function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Como normalizarTexto, mas só letras e números. Ex.: "E-Commerce" -> "ecommerce" */
export function chaveTexto(valor) {
  return normalizarTexto(valor).replace(/[^a-z0-9]/g, '');
}

/** Trim; string vazia vira null. */
export function textoOuNull(valor) {
  const t = String(valor ?? '').trim();
  return t === '' ? null : t;
}

// ---------------------------------------------------------------------
// CNPJ
// ---------------------------------------------------------------------

/** Valida os dígitos verificadores. Aceita com ou sem máscara. */
export function validarCnpj(valor) {
  const d = somenteDigitos(valor);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false; // 00000000000000, 11111111111111...

  const calcular = (base) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, n, i) => acc + Number(n) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const dv1 = calcular(d.slice(0, 12));
  const dv2 = calcular(d.slice(0, 12) + dv1);
  return d.endsWith(`${dv1}${dv2}`);
}

/** 14 dígitos -> 00.000.000/0000-00. Outros tamanhos voltam como vieram. */
export function formatarCnpj(valor) {
  const d = somenteDigitos(valor);
  if (d.length !== 14) return String(valor ?? '');
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

/** Máscara progressiva para digitação: 00.000.000/0000-00 */
export function mascaraCnpj(valor) {
  const d = somenteDigitos(valor).slice(0, 14);
  let r = d.slice(0, 2);
  if (d.length > 2) r += '.' + d.slice(2, 5);
  if (d.length > 5) r += '.' + d.slice(5, 8);
  if (d.length > 8) r += '/' + d.slice(8, 12);
  if (d.length > 12) r += '-' + d.slice(12, 14);
  return r;
}

// ---------------------------------------------------------------------
// Telefone
// ---------------------------------------------------------------------

/**
 * Normaliza para 55 + DDD + número (8 ou 9 dígitos). Retorna null se inválido.
 * Aceita: "(11) 91234-5678", "11912345678", "+55 11 91234-5678", "011 91234-5678".
 * Regra pelo tamanho (sem zeros à esquerda):
 *   10 ou 11 dígitos -> DDD + número, recebe o 55 na frente
 *   12 ou 13 dígitos -> precisa começar com 55
 */
export function normalizarTelefone(valor) {
  let d = somenteDigitos(valor).replace(/^0+/, '');
  if (d.length === 10 || d.length === 11) {
    d = '55' + d;
  } else if (!((d.length === 12 || d.length === 13) && d.startsWith('55'))) {
    return null;
  }

  const ddd = d.slice(2, 4);
  const numero = d.slice(4);
  if (!DDDS_VALIDOS.has(ddd)) return null;
  if (numero.length === 9 && numero[0] !== '9') return null; // celular começa com 9
  if (numero.length === 8 && !/^[2-9]/.test(numero)) return null;
  return d;
}

// DDDs em uso no Brasil (Anatel)
const DDDS_VALIDOS = new Set([
  '11', '12', '13', '14', '15', '16', '17', '18', '19',
  '21', '22', '24', '27', '28',
  '31', '32', '33', '34', '35', '37', '38',
  '41', '42', '43', '44', '45', '46', '47', '48', '49',
  '51', '53', '54', '55',
  '61', '62', '63', '64', '65', '66', '67', '68', '69',
  '71', '73', '74', '75', '77', '79',
  '81', '82', '83', '84', '85', '86', '87', '88', '89',
  '91', '92', '93', '94', '95', '96', '97', '98', '99',
]);

/** "5511912345678" -> "(11) 91234-5678". Se não der para normalizar, devolve o original. */
export function formatarTelefone(valor) {
  const n = normalizarTelefone(valor);
  if (!n) return String(valor ?? '');
  const ddd = n.slice(2, 4);
  const numero = n.slice(4);
  const corte = numero.length - 4;
  return `(${ddd}) ${numero.slice(0, corte)}-${numero.slice(corte)}`;
}

/** Máscara progressiva para digitação: (00) 00000-0000 ou (00) 0000-0000 */
export function mascaraTelefone(valor) {
  let d = somenteDigitos(valor);
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2); // colou com +55
  d = d.slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

// ---------------------------------------------------------------------
// Serviço e etapa
// ---------------------------------------------------------------------

// Chaves já passadas por chaveTexto(). Ordem importa na busca por "contém".
const SINONIMOS_SERVICO = [
  ['Landing page', ['landingpage', 'landing', 'lp', 'paginadecaptura', 'paginadevendas']],
  ['E-commerce', ['ecommerce', 'ecomerce', 'lojavirtual', 'lojaonline', 'loja']],
  ['Catálogo', ['catalogo', 'catalogodigital', 'catalogovirtual', 'catalogoonline']],
  ['Site institucional', ['siteinstitucional', 'institucional', 'website', 'site']],
  ['Automação', ['automacao', 'automacoes', 'automatizacao', 'chatbot', 'bot', 'rpa']],
  ['SaaS avulso', ['saasavulso', 'saas', 'sistema', 'software', 'aplicativo', 'app']],
];

/** Converte variações ("LP", "ecommerce", "sistema"...) para o valor oficial. null se não reconhecer. */
export function normalizarServico(valor) {
  const chave = chaveTexto(valor);
  if (!chave) return null;
  for (const [servico, sinonimos] of SINONIMOS_SERVICO) {
    if (sinonimos.includes(chave)) return servico;
  }
  // "loja virtual completa", "quer um sistema de agenda" etc.
  // Sinônimos curtos (lp, bot, app, rpa) só valem como palavra inteira, para não casar "botox".
  for (const [servico, sinonimos] of SINONIMOS_SERVICO) {
    if (sinonimos.some((s) => s.length >= 4 && chave.includes(s))) return servico;
  }
  const palavras = normalizarTexto(valor).split(/[^a-z0-9]+/);
  for (const [servico, sinonimos] of SINONIMOS_SERVICO) {
    if (sinonimos.some((s) => s.length < 4 && palavras.includes(s))) return servico;
  }
  return null;
}

/** Converte variações de escrita da etapa ("reuniao marcada") para o valor oficial. null se não reconhecer. */
export function normalizarEtapa(valor) {
  const chave = chaveTexto(valor);
  if (!chave) return null;
  return ETAPAS.find((e) => chaveTexto(e) === chave) ?? null;
}

// ---------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------

/** "AAAA-MM-DD" existente no calendário. */
export function dataIsoValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [a, m, d] = valor.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Data local em "AAAA-MM-DD" (recebe a data para facilitar teste). */
export function hojeIso(agora = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${p(agora.getMonth() + 1)}-${p(agora.getDate())}`;
}

/** "2026-09-25" -> "25/09/2026". Aceita também timestamp ISO completo (usa a data local). */
export function formatarDataBr(valor) {
  if (!valor) return '';
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : hojeIso(new Date(valor));
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

/** Follow-up vencido: data anterior a hoje. */
export function followUpVencido(dataIso, hoje = hojeIso()) {
  return Boolean(dataIso) && dataIso < hoje;
}

// ---------------------------------------------------------------------
// Lead completo
// ---------------------------------------------------------------------

/**
 * Valida e normaliza os dados de um lead vindos do formulário (ou da importação).
 * Retorna { valido, erros: { campo: mensagem }, lead: objeto pronto para gravar }.
 */
export function validarLead(dados) {
  const erros = {};

  const nome = textoOuNull(dados.nome);
  if (!nome) erros.nome = 'Informe o nome da empresa.';

  const segmento = textoOuNull(dados.segmento);
  if (!segmento) erros.segmento = 'Informe o segmento.';

  let telefone = null;
  if (!textoOuNull(dados.telefone)) {
    erros.telefone = 'Informe o telefone com DDD.';
  } else {
    telefone = normalizarTelefone(dados.telefone);
    if (!telefone) erros.telefone = 'Telefone inválido. Use DDD + número com 8 ou 9 dígitos. Ex.: (00) 00000-0000.';
  }

  let cnpj = null;
  if (textoOuNull(dados.cnpj)) {
    cnpj = somenteDigitos(dados.cnpj);
    if (cnpj.length !== 14) erros.cnpj = 'O CNPJ precisa ter 14 dígitos.';
    else if (!validarCnpj(cnpj)) erros.cnpj = 'CNPJ inválido (dígitos verificadores não conferem).';
  }

  let servico = null;
  if (textoOuNull(dados.servico)) {
    servico = SERVICOS.includes(dados.servico) ? dados.servico : normalizarServico(dados.servico);
    if (!servico) erros.servico = 'Serviço não reconhecido.';
  }

  let etapa = ETAPA_INICIAL;
  if (textoOuNull(dados.etapa)) {
    etapa = ETAPAS.includes(dados.etapa) ? dados.etapa : normalizarEtapa(dados.etapa);
    if (!etapa) erros.etapa = 'Etapa não reconhecida.';
  }

  const followUp = textoOuNull(dados.follow_up_em);
  if (followUp && !dataIsoValida(followUp)) erros.follow_up_em = 'Data inválida.';

  return {
    valido: Object.keys(erros).length === 0,
    erros,
    lead: {
      nome,
      cnpj,
      telefone,
      segmento,
      servico,
      responsavel: textoOuNull(dados.responsavel),
      etapa,
      origem: textoOuNull(dados.origem),
      observacoes: textoOuNull(dados.observacoes),
      follow_up_em: followUp,
    },
  };
}

/**
 * Identifica qual campo causou um erro de unicidade (código 23505 do Postgres).
 * Retorna 'cnpj', 'telefone' ou null.
 */
export function campoDoErroUnico(erro) {
  if (!erro || erro.code !== '23505') return null;
  const texto = `${erro.message ?? ''} ${erro.details ?? ''}`;
  if (texto.includes(INDICE_CNPJ)) return 'cnpj';
  if (texto.includes(INDICE_TELEFONE)) return 'telefone';
  return null;
}
