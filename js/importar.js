// Importação de planilhas: leitura de CSV/TXT, mapeamento de colunas e validação linha a linha.
// Módulo puro (sem DOM, sem Supabase). O XLSX é convertido em linhas pela tela (SheetJS)
// e depois passa pelas mesmas funções daqui.
import {
  validarLead, normalizarTelefone, normalizarServico, normalizarEtapa, somenteDigitos, chaveTexto, textoOuNull,
} from './validators.js';
import { SERVICOS, ETAPAS } from './constants.js';

// Observações aceitam várias colunas (site, situação, tipo de telefone...), cada uma com o nome da coluna na frente
const CAMPO_MULTIPLO = 'observacoes';
const NOMES_OBSERVACAO = ['observacoes', 'observacao', 'obs', 'notas', 'anotacoes', 'comentarios'];

/** Campos que dá para importar, com os nomes de coluna que costumam aparecer nas planilhas. */
export const CAMPOS_IMPORTACAO = [
  { campo: 'nome', rotulo: 'Nome da empresa', sinonimos: ['nome', 'empresa', 'nomedaempresa', 'nomefantasia', 'fantasia', 'razaosocial', 'razao', 'cliente', 'lead', 'estabelecimento', 'title', 'titulo'] },
  { campo: 'telefone', rotulo: 'Telefone / WhatsApp', sinonimos: ['telefone', 'fone', 'tel', 'celular', 'whatsapp', 'whats', 'zap', 'phone', 'numero', 'telefone1', 'phonenumber'] },
  { campo: 'cnpj', rotulo: 'CNPJ', sinonimos: ['cnpj', 'documento', 'cpfcnpj'] },
  { campo: 'segmento', rotulo: 'Segmento', sinonimos: ['segmento', 'ramo', 'categoria', 'category', 'nicho', 'setor', 'atividade', 'tipo'] },
  { campo: 'servico', rotulo: 'Serviço', sinonimos: ['servico', 'produto', 'solucao', 'interesse', 'oportunidade'] },
  { campo: 'responsavel', rotulo: 'Responsável', sinonimos: ['responsavel', 'contato', 'nomedocontato', 'pessoa', 'dono', 'proprietario', 'socio'] },
  { campo: 'email', rotulo: 'E-mail', sinonimos: ['email', 'e-mail', 'mail'] },
  { campo: 'cidade', rotulo: 'Cidade', sinonimos: ['cidade', 'municipio', 'city'] },
  { campo: 'uf', rotulo: 'UF', sinonimos: ['uf', 'estado', 'state'] },
  { campo: 'origem', rotulo: 'Origem', sinonimos: ['origem', 'fonte', 'canal', 'source'] },
  { campo: 'etapa', rotulo: 'Etapa', sinonimos: ['etapa', 'status', 'fase'] },
  { campo: 'follow_up_em', rotulo: 'Follow-up', sinonimos: ['followup', 'retorno', 'proximocontato', 'datadoretorno'] },
  { campo: 'observacoes', rotulo: 'Observações', sinonimos: ['observacoes', 'observacao', 'obs', 'notas', 'anotacoes', 'comentarios', 'endereco', 'address', 'site', 'website', 'url', 'instagram', 'situacaosite', 'tipotelefone', 'tipodetelefone'] },
];

/** Separador mais provável olhando a primeira linha (fora de aspas). */
export function detectarSeparador(texto) {
  const linha = String(texto ?? '').split(/\r?\n/).find((l) => l.trim()) ?? '';
  const contagem = { ';': 0, ',': 0, '\t': 0, '|': 0 };
  let aspas = false;
  for (const c of linha) {
    if (c === '"') aspas = !aspas;
    else if (!aspas && c in contagem) contagem[c] += 1;
  }
  const [melhor, n] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? melhor : ';';
}

/**
 * Lê CSV/TXT respeitando aspas ("a;b" fica numa célula só, "" vira ").
 * Tira o BOM do Excel e ignora linhas totalmente vazias.
 */
export function lerCsv(texto, separador = detectarSeparador(texto)) {
  const s = String(texto ?? '').replace(/^﻿/, '');
  const linhas = [];
  let linha = [];
  let celula = '';
  let aspas = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (aspas) {
      if (c === '"' && s[i + 1] === '"') { celula += '"'; i++; }
      else if (c === '"') aspas = false;
      else celula += c;
    } else if (c === '"' && celula === '') {
      aspas = true;
    } else if (c === separador) {
      linha.push(celula); celula = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      linha.push(celula); celula = '';
      linhas.push(linha); linha = [];
    } else {
      celula += c;
    }
  }
  linha.push(celula);
  linhas.push(linha);
  return linhas
    .map((l) => l.map((v) => v.trim()))
    .filter((l) => l.some((v) => v !== ''));
}

/**
 * Sugere o campo de cada coluna pelo nome do cabeçalho. Cada campo é usado uma vez só
 * (menos Observações, que junta várias colunas).
 * Retorna um array com o campo (ou '' = ignorar) na mesma ordem das colunas.
 */
export function sugerirMapeamento(cabecalho) {
  const usados = new Set();
  const chaves = cabecalho.map((c) => chaveTexto(c));
  const resultado = chaves.map(() => '');
  // 1ª passada: nome exato; 2ª: o cabeçalho contém o sinônimo ("Telefone comercial")
  for (const exato of [true, false]) {
    chaves.forEach((chave, i) => {
      if (resultado[i] || !chave) return;
      const achado = CAMPOS_IMPORTACAO.find((c) => !usados.has(c.campo) && c.sinonimos.some((s) => {
        const sin = chaveTexto(s);
        return exato ? chave === sin : sin.length >= 4 && chave.includes(sin);
      }));
      if (achado) {
        resultado[i] = achado.campo;
        if (achado.campo !== CAMPO_MULTIPLO) usados.add(achado.campo);
      }
    });
  }
  return resultado;
}

/** A primeira linha parece cabeçalho? (tem algum nome de campo conhecido e nenhum telefone) */
export function pareceCabecalho(linha) {
  const temCampo = sugerirMapeamento(linha).some(Boolean);
  const temTelefone = linha.some((v) => normalizarTelefone(v));
  return temCampo && !temTelefone;
}

/** Pega o primeiro telefone válido de uma célula que pode ter vários ("11 9999-9999 / 11 3333-3333"). */
export function primeiroTelefone(valor) {
  const texto = String(valor ?? '');
  if (normalizarTelefone(texto)) return texto;
  const partes = texto.split(/[/;,|]|\s+e\s+|\s+ou\s+/i);
  return partes.find((p) => normalizarTelefone(p)) ?? texto;
}

/** "25/09/2026", "25/09/26" ou "2026-09-25" -> "2026-09-25". Outra coisa volta como veio. */
export function dataParaIso(valor) {
  const t = String(valor ?? '').trim();
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  return t.slice(0, 10).match(/^\d{4}-\d{2}-\d{2}$/) ? t.slice(0, 10) : t;
}

/** Coluna extra que vai para Observações: "situacao_site" + "Sem site" -> "Situacao site: Sem site". */
function comRotulo(nomeColuna, valor) {
  const nome = String(nomeColuna ?? '').replace(/[_-]+/g, ' ').trim();
  if (!nome || NOMES_OBSERVACAO.includes(chaveTexto(nome))) return valor;
  return `${nome[0].toUpperCase()}${nome.slice(1)}: ${valor}`;
}

/**
 * Valida as linhas com o mapeamento escolhido.
 * padroes: valores usados quando a coluna não existe ou está vazia ({ segmento, origem, servico, vendedor_id })
 * existentes: leads já cadastrados (para marcar duplicados)
 * cabecalho:  nomes das colunas (usados como rótulo nas Observações)
 * Retorna [{ numero, lead, erros, status: 'ok' | 'invalido' | 'duplicado', motivo }]
 */
export function prepararImportacao(linhas, mapeamento, padroes = {}, existentes = [], cabecalho = null) {
  const telefones = new Map(existentes.map((l) => [l.telefone, l.nome]));
  const cnpjs = new Map(existentes.filter((l) => l.cnpj).map((l) => [l.cnpj, l.nome]));

  return linhas.map((linha, i) => {
    const dados = {};
    const notas = [];
    mapeamento.forEach((campo, col) => {
      if (!campo) return;
      const valor = textoOuNull(linha[col]);
      if (!valor) return;
      if (campo === CAMPO_MULTIPLO) notas.push(comRotulo(cabecalho?.[col], valor));
      else dados[campo] = dados[campo] ? `${dados[campo]} · ${valor}` : valor;
    });
    for (const campo of ['segmento', 'origem', 'servico']) {
      if (!dados[campo] && padroes[campo]) dados[campo] = padroes[campo];
    }
    // Serviço ou etapa que o CRM não conhece ("A avaliar") não derruba a linha: vira anotação
    if (dados.servico && !SERVICOS.includes(dados.servico) && !normalizarServico(dados.servico)) {
      notas.push(`Serviço: ${dados.servico}`);
      delete dados.servico;
    }
    if (dados.etapa && !ETAPAS.includes(dados.etapa) && !normalizarEtapa(dados.etapa)) {
      notas.push(`Etapa na planilha: ${dados.etapa}`);
      delete dados.etapa;
    }
    if (notas.length) dados.observacoes = notas.join('\n');
    if (dados.telefone) dados.telefone = primeiroTelefone(dados.telefone);
    if (dados.follow_up_em) dados.follow_up_em = dataParaIso(dados.follow_up_em);
    if (dados.cnpj && somenteDigitos(dados.cnpj).length < 14) {
      dados.cnpj = somenteDigitos(dados.cnpj).padStart(14, '0'); // Excel come os zeros à esquerda
    }

    const { erros, lead } = validarLead(dados);
    if (padroes.vendedor_id) lead.vendedor_id = padroes.vendedor_id;
    const numero = i + 1;
    if (Object.keys(erros).length) {
      return { numero, lead, erros, status: 'invalido', motivo: Object.values(erros).join(' ') };
    }
    const dupTel = telefones.get(lead.telefone);
    const dupCnpj = lead.cnpj && cnpjs.get(lead.cnpj);
    if (dupTel || dupCnpj) {
      const quem = dupTel ?? dupCnpj;
      const oque = dupTel ? 'Telefone' : 'CNPJ';
      return { numero, lead, erros, status: 'duplicado', motivo: `${oque} já usado por "${quem}".` };
    }
    // Marca para pegar duplicados dentro do próprio arquivo
    telefones.set(lead.telefone, `${lead.nome} (linha ${numero})`);
    if (lead.cnpj) cnpjs.set(lead.cnpj, `${lead.nome} (linha ${numero})`);
    return { numero, lead, erros, status: 'ok', motivo: '' };
  });
}
