// Buscador de leads no Google (Places API). A conversão dos resultados é pura (testável);
// `buscarLugares` faz a requisição.
import { normalizarTelefone, textoOuNull, normalizarTexto } from './validators.js';

const URL_API = 'https://places.googleapis.com/v1/places:searchText';

// Só os campos usados (o Google cobra pelo nível do campo mais caro pedido)
const CAMPOS = [
  'places.id', 'places.displayName', 'places.nationalPhoneNumber', 'places.internationalPhoneNumber',
  'places.websiteUri', 'places.formattedAddress', 'places.addressComponents', 'places.rating',
  'places.userRatingCount', 'places.googleMapsUri', 'places.businessStatus', 'places.primaryTypeDisplayName',
  'nextPageToken',
].join(',');

/**
 * Nichos prontos: o que buscar no Google e com qual segmento o lead entra no CRM
 * (o segmento bate com os modelos de mensagem).
 */
export const NICHOS = [
  { rotulo: 'Dentistas / clínicas odontológicas', busca: 'clínica odontológica', segmento: 'Odontologia' },
  { rotulo: 'Clínicas veterinárias', busca: 'clínica veterinária', segmento: 'Veterinária' },
  { rotulo: 'Clínicas de estética', busca: 'clínica de estética', segmento: 'Estética' },
  { rotulo: 'Psicólogos', busca: 'psicólogo', segmento: 'Psicologia' },
  { rotulo: 'Podólogos', busca: 'podologia', segmento: 'Podologia' },
  { rotulo: 'Fisioterapia', busca: 'fisioterapia', segmento: 'Fisioterapia' },
  { rotulo: 'Nutricionistas', busca: 'nutricionista', segmento: 'Nutrição' },
  { rotulo: 'Fonoaudiólogos', busca: 'fonoaudiólogo', segmento: 'Fonoaudiologia' },
  { rotulo: 'Clínicas médicas', busca: 'clínica médica', segmento: 'Clínica médica' },
  { rotulo: 'Pet shops', busca: 'pet shop', segmento: 'Pet shop' },
  { rotulo: 'Salões de beleza', busca: 'salão de beleza', segmento: 'Salão de beleza' },
  { rotulo: 'Barbearias', busca: 'barbearia', segmento: 'Barbearia' },
  { rotulo: 'Academias', busca: 'academia', segmento: 'Academia' },
  { rotulo: 'Advogados', busca: 'escritório de advocacia', segmento: 'Advocacia' },
  { rotulo: 'Contabilidades', busca: 'escritório de contabilidade', segmento: 'Contabilidade' },
  { rotulo: 'Imobiliárias', busca: 'imobiliária', segmento: 'Imobiliária' },
  { rotulo: 'Restaurantes', busca: 'restaurante', segmento: 'Restaurante' },
  { rotulo: 'Oficinas mecânicas', busca: 'oficina mecânica', segmento: 'Oficina mecânica' },
];

/** Nicho pronto pelo texto digitado (rótulo ou termo de busca), ou null. */
export function nichoDoTexto(texto) {
  const t = normalizarTexto(texto);
  return NICHOS.find((n) => normalizarTexto(n.rotulo) === t || normalizarTexto(n.busca) === t) ?? null;
}

/** Celular (9 dígitos começando com 9 depois do DDD) é o que costuma ter WhatsApp. */
export function tipoTelefone(telefoneNormalizado) {
  if (!telefoneNormalizado) return 'nenhum';
  return telefoneNormalizado.length === 13 ? 'celular' : 'fixo';
}

/** Site que é só rede social ou agregador não conta como site próprio. */
export function siteProprio(url) {
  if (!url) return false;
  return !/(instagram\.com|facebook\.com|linktr\.ee|wa\.me|whatsapp\.com|doctoralia|boaconsulta|ifood\.com|linkedin\.com|tiktok\.com|youtube\.com|google\.com|goo\.gl|business\.site|negocio\.site)/i.test(url);
}

function componente(lugar, tipo, campo = 'longText') {
  return lugar.addressComponents?.find((c) => c.types?.includes(tipo))?.[campo] ?? null;
}

/** Converte um resultado do Google no formato do buscador. */
export function converterLugar(lugar) {
  const telefone = normalizarTelefone(lugar.internationalPhoneNumber ?? '') ?? normalizarTelefone(lugar.nationalPhoneNumber ?? '');
  const site = textoOuNull(lugar.websiteUri);
  const uf = componente(lugar, 'administrative_area_level_1', 'shortText');
  return {
    googleId: lugar.id,
    nome: textoOuNull(lugar.displayName?.text) ?? 'Sem nome',
    categoria: textoOuNull(lugar.primaryTypeDisplayName?.text),
    telefone,
    tipoTelefone: tipoTelefone(telefone),
    site,
    temSite: siteProprio(site),
    endereco: textoOuNull(lugar.formattedAddress),
    cidade: componente(lugar, 'administrative_area_level_2'),
    uf: uf && /^[A-Z]{2}$/.test(uf) ? uf : null,
    nota: lugar.rating ?? null,
    avaliacoes: lugar.userRatingCount ?? 0,
    mapsUrl: textoOuNull(lugar.googleMapsUri),
    fechado: lugar.businessStatus === 'CLOSED_PERMANENTLY',
  };
}

/** Marca quem já está no CRM (pelo telefone) e tira duplicados da própria busca. */
export function marcarExistentes(resultados, leads) {
  const noCrm = new Map(leads.map((l) => [l.telefone, l.nome]));
  const vistos = new Set();
  return resultados.filter((r) => {
    if (vistos.has(r.googleId)) return false;
    vistos.add(r.googleId);
    return true;
  }).map((r) => ({ ...r, noCrm: (r.telefone && noCrm.get(r.telefone)) || null }));
}

/**
 * filtros: { semSite, soCelular, esconderNoCrm }
 * Fechados definitivamente nunca aparecem.
 */
export function filtrarResultados(resultados, filtros = {}) {
  return resultados.filter((r) => {
    if (r.fechado) return false;
    if (filtros.semSite && r.temSite) return false;
    if (filtros.soCelular && r.tipoTelefone !== 'celular') return false;
    if (filtros.esconderNoCrm && r.noCrm) return false;
    return true;
  });
}

/** Pode ir para o CRM? (telefone é obrigatório no cadastro) */
export function podeAdicionar(r) {
  return Boolean(r.telefone) && !r.noCrm && !r.fechado;
}

/** Monta o lead do CRM a partir do resultado. */
export function leadDoResultado(r, { segmento, vendedor_id = null }) {
  const obs = [];
  if (r.categoria) obs.push(`Categoria no Google: ${r.categoria}`);
  obs.push(`Telefone: ${r.tipoTelefone === 'celular' ? 'Celular' : 'Fixo'}`);
  obs.push(r.site ? `Site: ${r.site}${r.temSite ? '' : ' (não é site próprio)'}` : 'Situação site: Sem site');
  if (r.nota) obs.push(`Google: nota ${r.nota} (${r.avaliacoes} avaliações)`);
  if (r.endereco) obs.push(`Endereço: ${r.endereco}`);
  if (r.mapsUrl) obs.push(`Maps: ${r.mapsUrl}`);
  return {
    nome: r.nome,
    telefone: r.telefone,
    segmento,
    servico: r.temSite ? null : 'Site institucional',
    cidade: r.cidade,
    uf: r.uf,
    origem: 'Google Maps',
    observacoes: obs.join('\n'),
    vendedor_id,
  };
}

/**
 * Faz uma busca de texto no Google. Até 20 resultados por página.
 * Retorna { lugares: [convertidos], proximaPagina: token | null }.
 */
export async function buscarLugares({ chave, texto, proximaPagina = null }) {
  const corpo = { textQuery: texto, languageCode: 'pt-BR', regionCode: 'BR', pageSize: 20 };
  if (proximaPagina) corpo.pageToken = proximaPagina;
  let resposta;
  try {
    resposta = await fetch(URL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': chave, 'X-Goog-FieldMask': CAMPOS },
      body: JSON.stringify(corpo),
    });
  } catch {
    throw new Error('Sem conexão com o Google. Tente de novo em instantes.');
  }
  const json = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(mensagemErroGoogle(resposta.status, json?.error?.message ?? ''));
  return {
    lugares: (json.places ?? []).map(converterLugar),
    proximaPagina: json.nextPageToken ?? null,
  };
}

/** Traduz os erros mais comuns da API do Google. */
export function mensagemErroGoogle(status, mensagem) {
  if (/api key not valid|API_KEY_INVALID/i.test(mensagem)) return 'Chave do Google inválida. Confira a chave em "Trocar chave".';
  if (/billing/i.test(mensagem)) return 'O projeto no Google Cloud está sem faturamento ativado. Ative o billing para usar a Places API.';
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(mensagem)) return 'A "Places API (New)" não está ativada no projeto do Google Cloud.';
  if (/referer|referrer|blocked/i.test(mensagem)) return 'A chave está bloqueando este endereço. Adicione o site nas restrições da chave (HTTP referrers).';
  if (status === 429) return 'Limite de buscas do Google atingido. Espere um pouco ou aumente a cota.';
  return `O Google recusou a busca (erro ${status}). ${mensagem}`.trim();
}
