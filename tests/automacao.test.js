// Testes das automações: mensagens, fila do dia, importação, CNPJ e métricas.
// Objetos montados aqui mesmo; nada é gravado no banco.
import { teste, igual, igualProfundo, verdadeiro, falso } from './harness.js';
import {
  saudacao, primeiroNome, montarMensagem, variaveisDesconhecidas, escolherMensagem, linkWhatsApp,
} from '../js/mensagens.js';
import { montarFila, totalFila, sugerirPerdido, somarDias, filtrarLeads } from '../js/regras.js';
import {
  detectarSeparador, lerCsv, sugerirMapeamento, pareceCabecalho, primeiroTelefone, dataParaIso, prepararImportacao,
} from '../js/importar.js';
import { capitalizarNome, dadosDoCnpj } from '../js/cnpj.js';
import { calcularMetricas, agruparPor, taxa } from '../js/metricas.js';
import { validarLead } from '../js/validators.js';

const AGORA = new Date(2026, 8, 28, 10, 0); // 28/09/2026 10h (hora local)
const diasAtras = (n) => new Date(2026, 8, 28 - n, 9, 0).toISOString();

// ---------------------------------------------------------------------
// Mensagens
// ---------------------------------------------------------------------
teste('Mensagens: saudação pelo horário e primeiro nome', () => {
  igual(saudacao(new Date(2026, 0, 1, 8)), 'Bom dia');
  igual(saudacao(new Date(2026, 0, 1, 12)), 'Boa tarde');
  igual(saudacao(new Date(2026, 0, 1, 17, 59)), 'Boa tarde');
  igual(saudacao(new Date(2026, 0, 1, 18)), 'Boa noite');
  igual(primeiroNome('  maria clara souza '), 'Maria');
  igual(primeiroNome(null), '');
});

teste('Mensagens: variáveis, acento e variável vazia somem com a vírgula', () => {
  const lead = { nome: 'Clínica Sorriso', responsavel: 'ana paula', segmento: 'Odonto', servico: 'Landing page' };
  const texto = '{saudacao}, {Responsável}! Aqui é o {vendedor}. A {empresa} ({segmento}) precisa de {servico}?';
  igual(montarMensagem(texto, lead, { agora: AGORA, vendedor: 'brian wood' }),
    'Bom dia, Ana! Aqui é o Brian. A Clínica Sorriso (Odonto) precisa de Landing page?');
  igual(montarMensagem('Olá, {responsavel}! Tudo bem?', { nome: 'X' }), 'Olá! Tudo bem?');
  igual(montarMensagem('Oi {responsavel}, tudo bem?', { nome: 'X' }), 'Oi, tudo bem?');
  igual(montarMensagem('Oi {nome_errado}', { nome: 'X' }), 'Oi {nome_errado}', 'desconhecida fica');
  igualProfundo(variaveisDesconhecidas('{saudacao} {responsável} {xpto} {xpto}'), ['xpto']);
});

teste('Mensagens: escolhe o modelo mais específico', () => {
  const msgs = [
    { id: 'geral', padrao: true },
    { id: 'novo', etapa_gatilho: 'Novo' },
    { id: 'novo-odonto', etapa_gatilho: 'Novo', segmento_gatilho: 'Clínica Odontológica' },
    { id: 'cobranca', etapa_gatilho: 'Mensagem enviada' },
  ];
  igual(escolherMensagem(msgs, { etapa: 'Novo', segmento: 'clinica odontologica' }).id, 'novo-odonto');
  igual(escolherMensagem(msgs, { etapa: 'Novo', segmento: 'Petshop' }).id, 'novo');
  igual(escolherMensagem(msgs, { etapa: 'Mensagem enviada', segmento: 'Petshop' }).id, 'cobranca');
  igual(escolherMensagem(msgs, { etapa: 'Respondeu', segmento: 'Petshop' }).id, 'geral');
  igual(escolherMensagem([{ id: 'so', etapa_gatilho: 'Novo' }], { etapa: 'Respondeu' }).id, 'so', 'sem compatível: primeira');
  igual(escolherMensagem([], {}), null);
});

teste('Mensagens: link do WhatsApp codifica o texto', () => {
  igual(linkWhatsApp('5511912345678'), 'https://wa.me/5511912345678');
  igual(linkWhatsApp('5511912345678', 'Olá, tudo bem?\nAbraço'),
    'https://wa.me/5511912345678?text=Ol%C3%A1%2C%20tudo%20bem%3F%0AAbra%C3%A7o');
});

// ---------------------------------------------------------------------
// Fila do dia
// ---------------------------------------------------------------------
const L = (id, extra) => ({ id, nome: `L${id}`, telefone: '5511900000000', segmento: 'S', etapa: 'Novo', movido_em: diasAtras(0), criado_em: diasAtras(0), ...extra });

teste('Fila: cada lead cai em um grupo só, na ordem certa', () => {
  const leads = [
    L(1, { etapa: 'Mensagem enviada', follow_up_em: '2026-09-20', ultimo_contato_em: diasAtras(8) }),
    L(2, { etapa: 'Mensagem enviada', follow_up_em: '2026-09-26', ultimo_contato_em: diasAtras(2) }),
    L(3, { etapa: 'Respondeu', follow_up_em: '2026-09-28' }),
    L(4, { criado_em: diasAtras(3) }),
    L(5, { criado_em: diasAtras(9) }),
    L(6, { etapa: 'Proposta enviada', movido_em: diasAtras(10) }),
    L(7, { etapa: 'Proposta enviada', movido_em: diasAtras(10), follow_up_em: '2026-10-05' }),
    L(8, { etapa: 'Fechado', follow_up_em: '2026-09-01' }),
    L(9, { etapa: 'Reunião marcada', movido_em: diasAtras(2) }),
  ];
  const f = montarFila(leads, AGORA);
  igualProfundo(f.atrasados.map((l) => l.id), [1, 2], 'atrasados, o mais antigo primeiro');
  igualProfundo(f.hoje.map((l) => l.id), [3]);
  igualProfundo(f.novos.map((l) => l.id), [5, 4], 'novos, o mais antigo primeiro');
  igualProfundo(f.esquecidos.map((l) => l.id), [6], 'follow-up futuro e final ficam fora');
  igual(totalFila(f), 6);
});

teste('Fila: sugerir perdido e somar dias', () => {
  verdadeiro(sugerirPerdido({ etapa: 'Mensagem enviada', tentativas: 3 }));
  falso(sugerirPerdido({ etapa: 'Mensagem enviada', tentativas: 2 }));
  falso(sugerirPerdido({ etapa: 'Respondeu', tentativas: 5 }), 'já respondeu');
  igual(somarDias('2026-09-28', 3), '2026-10-01');
  igual(somarDias('2026-12-31', 1), '2027-01-01');
});

teste('Filtro: por vendedor', () => {
  const leads = [L(1, { vendedor_id: 'a' }), L(2, { vendedor_id: 'b' }), L(3, { vendedor_id: 'a' })];
  igualProfundo(filtrarLeads(leads, { vendedor: 'a' }, AGORA).map((l) => l.id), [1, 3]);
  igual(filtrarLeads(leads, { vendedor: '' }, AGORA).length, 3);
});

// ---------------------------------------------------------------------
// Importação
// ---------------------------------------------------------------------
teste('Importação: separador e CSV com aspas, BOM e CRLF', () => {
  igual(detectarSeparador('nome;telefone;cidade\n'), ';');
  igual(detectarSeparador('nome,telefone\n'), ',');
  igual(detectarSeparador('nome\ttelefone\n'), '\t');
  igual(detectarSeparador('"a;b",c,d\n'), ',', 'ignora separador dentro de aspas');
  igualProfundo(lerCsv('﻿nome;obs\r\n"Loja ""Top""";"a;b"\r\n\r\nX;y'),
    [['nome', 'obs'], ['Loja "Top"', 'a;b'], ['X', 'y']]);
  igualProfundo(lerCsv('a,"linha1\nlinha2"', ','), [['a', 'linha1\nlinha2']]);
});

teste('Importação: mapeamento automático de colunas', () => {
  igualProfundo(sugerirMapeamento(['Nome da Empresa', 'Telefone Comercial', 'CNPJ', 'Categoria', 'Contato', 'Cidade', 'Xyz']),
    ['nome', 'telefone', 'cnpj', 'segmento', 'responsavel', 'cidade', '']);
  igualProfundo(sugerirMapeamento(['title', 'phone', 'category', 'address']),
    ['nome', 'telefone', 'segmento', 'observacoes'], 'exportação do Google Maps');
  verdadeiro(pareceCabecalho(['Nome', 'Telefone']));
  falso(pareceCabecalho(['Clínica X', '(11) 91234-5678']));
});

teste('Importação: telefone múltiplo e datas', () => {
  igual(primeiroTelefone('(11) 3333 / (11) 91234-5678'), ' (11) 91234-5678');
  igual(primeiroTelefone('11912345678'), '11912345678');
  igual(dataParaIso('05/10/2026'), '2026-10-05');
  igual(dataParaIso('5/1/26'), '2026-01-05');
  igual(dataParaIso('2026-10-05T00:00:00'), '2026-10-05');
});

teste('Importação: valida linhas, usa padrões e marca duplicados', () => {
  const linhas = [
    ['Clínica A', '(11) 91234-5678', ''],
    ['Clínica B', '11 98765-4321', 'Petshop'],
    ['Clínica C', '123', ''],
    ['Clínica D', '11912345678', ''],        // repete a linha 1
    ['Clínica E', '(21) 99999-0000', ''],     // já existe no CRM
  ];
  const existentes = [{ nome: 'Antiga', telefone: '5521999990000', cnpj: null }];
  const r = prepararImportacao(linhas, ['nome', 'telefone', 'segmento'], { segmento: 'Clínica', origem: 'Lista', vendedor_id: 'u1' }, existentes);
  igualProfundo(r.map((x) => x.status), ['ok', 'ok', 'invalido', 'duplicado', 'duplicado']);
  igual(r[0].lead.segmento, 'Clínica', 'padrão preenche o vazio');
  igual(r[1].lead.segmento, 'Petshop', 'valor da planilha vence o padrão');
  igual(r[0].lead.origem, 'Lista');
  igual(r[0].lead.vendedor_id, 'u1');
  verdadeiro(r[3].motivo.includes('linha 1'), 'duplicado dentro do arquivo');
  verdadeiro(r[4].motivo.includes('Antiga'));
});

teste('Importação: CNPJ sem zero à esquerda (Excel) é corrigido', () => {
  // 04.252.011/0001-10 salvo como número no Excel vira 4252011000110
  const r = prepararImportacao([['X', '11912345678', 'S', '4252011000110']], ['nome', 'telefone', 'segmento', 'cnpj']);
  igual(r[0].status, 'ok');
  igual(r[0].lead.cnpj, '04252011000110');
});

// ---------------------------------------------------------------------
// Validação dos campos novos
// ---------------------------------------------------------------------
teste('Lead: e-mail, cidade e UF', () => {
  const base = { nome: 'X', telefone: '11912345678', segmento: 'S' };
  const ok = validarLead({ ...base, email: ' Contato@Empresa.com.BR ', uf: 'sp', cidade: ' Campinas ' });
  igual(ok.valido, true);
  igual(ok.lead.email, 'contato@empresa.com.br');
  igual(ok.lead.uf, 'SP');
  igual(ok.lead.cidade, 'Campinas');
  verdadeiro(validarLead({ ...base, email: 'sem-arroba' }).erros.email);
  verdadeiro(validarLead({ ...base, uf: 'São Paulo' }).erros.uf);
});

// ---------------------------------------------------------------------
// CNPJ
// ---------------------------------------------------------------------
teste('CNPJ: capitaliza nome e converte resposta da BrasilAPI', () => {
  igual(capitalizarNome('CLINICA DE OLHOS SAO JOSE LTDA'), 'Clinica de Olhos Sao Jose LTDA');
  const d = dadosDoCnpj({
    razao_social: 'SORRISO ODONTOLOGIA LTDA', nome_fantasia: 'CLINICA SORRISO',
    ddd_telefone_1: '1133334444', ddd_telefone_2: '11912345678', email: 'CONTATO@SORRISO.COM',
    municipio: 'SAO PAULO', uf: 'sp', cnae_fiscal_descricao: 'Atividade odontológica',
    descricao_situacao_cadastral: 'ATIVA', qsa: [{ nome_socio: 'ANA PAULA SILVA' }],
  });
  igual(d.nome, 'Clinica Sorriso');
  igual(d.telefone, '5511912345678', 'prefere celular');
  igual(d.email, 'contato@sorriso.com');
  igual(d.cidade, 'Sao Paulo');
  igual(d.uf, 'SP');
  igual(d.responsavel, 'Ana Paula Silva');
  igual(dadosDoCnpj({ razao_social: 'X LTDA', nome_fantasia: '', ddd_telefone_1: '' }).nome, 'X LTDA');
});

// ---------------------------------------------------------------------
// Métricas
// ---------------------------------------------------------------------
teste('Métricas: conversão, ciclo, agrupamentos e equipe', () => {
  igual(taxa(1, 3), 33.3);
  igual(taxa(0, 0), null);
  const leads = [
    L(1, { etapa: 'Fechado', criado_em: diasAtras(20), movido_em: diasAtras(10), origem: 'Instagram', vendedor_id: 'a' }),
    L(2, { etapa: 'Perdido', criado_em: diasAtras(15), movido_em: diasAtras(5), origem: 'instagram' }),
    L(3, { etapa: 'Novo', criado_em: diasAtras(2), origem: '' }),
    L(4, { etapa: 'Fechado', criado_em: diasAtras(200), movido_em: diasAtras(100) }), // fora do período
  ];
  const historico = [
    { tipo: 'envio', user_id: 'a', data: diasAtras(3) },
    { tipo: 'envio', user_id: 'b', data: diasAtras(4) },
    { tipo: 'envio', user_id: 'a', data: diasAtras(60) }, // fora
  ];
  const membros = [{ user_id: 'a', nome: 'Brian' }, { user_id: 'b', nome: 'Sócio' }];
  const m = calcularMetricas({ leads, historico, membros, dias: 30, agora: AGORA });
  igual(m.novos, 3);
  igual(m.fechados, 1);
  igual(m.perdidos, 1);
  igual(m.conversao, 50);
  igual(m.cicloMedio, 10);
  igual(m.envios, 2);
  igual(m.ativos, 1);
  igualProfundo(m.porOrigem.map((g) => [g.nome, g.total]), [['Instagram', 2], ['Não informado', 1]]);
  igualProfundo(m.porMembro.map((p) => [p.nome, p.envios, p.fechados]), [['Brian', 1, 1], ['Sócio', 1, 0]]);
  igual(calcularMetricas({ leads, dias: null, agora: AGORA }).fechados, 2, 'período "tudo"');
  igualProfundo(agruparPor([{ segmento: 'A', etapa: 'Fechado' }], 'segmento')[0], { nome: 'A', total: 1, fechados: 1, perdidos: 0, taxa: 100 });
});

teste('Importação: etapa "Novo lead", serviço desconhecido e colunas extras viram observação', () => {
  const cab = ['nome', 'telefone', 'tipo_telefone', 'segmento', 'site', 'situacao_site', 'oportunidade', 'etapa', 'observacoes'];
  const mapa = sugerirMapeamento(cab);
  igualProfundo(mapa, ['nome', 'telefone', 'observacoes', 'segmento', 'observacoes', 'observacoes', 'servico', 'etapa', 'observacoes']);
  const r = prepararImportacao([
    ['Alves', '+551140385725', 'Fixo', 'A definir', 'http://x.com.br/', 'Tem site', 'A avaliar', 'Novo lead', 'Ver site'],
    ['Zampolli', '+5511917771207', 'Celular', 'Odonto', '', 'Sem site', 'Catálogo / E-commerce', 'Novo lead', ''],
  ], mapa, {}, [], cab);
  igualProfundo(r.map((x) => x.status), ['ok', 'ok']);
  igual(r[0].lead.etapa, 'Novo');
  igual(r[0].lead.servico, null);
  igual(r[0].lead.observacoes, 'Tipo telefone: Fixo\nSite: http://x.com.br/\nSituacao site: Tem site\nVer site\nServiço: A avaliar');
  igual(r[1].lead.servico, 'E-commerce');
});

teste('Modelos sugeridos: variáveis válidas, gatilhos coerentes e escolha automática', async () => {
  const { MODELOS_SUGERIDOS, MODELO_LIVRE } = await import('../js/modelos-sugeridos.js');
  const { ETAPAS, SERVICOS } = await import('../js/constants.js');
  const titulos = new Set();
  for (const m of [...MODELOS_SUGERIDOS, MODELO_LIVRE]) {
    igualProfundo(variaveisDesconhecidas(m.texto), [], m.titulo);
    falso(titulos.has(m.titulo), `título repetido: ${m.titulo}`);
    titulos.add(m.titulo);
    if (m.etapa_gatilho) verdadeiro(ETAPAS.includes(m.etapa_gatilho), m.titulo);
    if (m.servico_gatilho) verdadeiro(SERVICOS.includes(m.servico_gatilho), m.titulo);
  }
  igual(MODELOS_SUGERIDOS.filter((m) => m.padrao).length, 1, 'um padrão só');
  const escolher = (lead) => escolherMensagem(MODELOS_SUGERIDOS, lead).titulo;
  igual(escolher({ etapa: 'Novo', segmento: 'Veterinária', servico: 'Site institucional' }), '1º contato — veterinária');
  igual(escolher({ etapa: 'Novo', segmento: 'A definir', servico: 'Landing page' }), '1º contato — landing page');
  igual(escolher({ etapa: 'Novo', segmento: 'A definir', servico: null }), 'Geral — primeiro contato');
  igual(escolher({ etapa: 'Mensagem enviada', segmento: 'Odontologia' }), 'Cobrança — sem resposta');
  igual(escolher({ etapa: 'Proposta enviada', segmento: 'X' }), 'Retorno da proposta');
  igual(montarMensagem(MODELO_LIVRE.texto, { responsavel: '' }, { agora: AGORA }), 'Bom dia!\n\n');
});

// ---------------------------------------------------------------------
// Buscador de leads (Google Places)
// ---------------------------------------------------------------------
teste('Buscador: converte resultado do Google, tipo de telefone e site próprio', async () => {
  const b = await import('../js/busca-leads.js');
  const r = b.converterLugar({
    id: 'g1', displayName: { text: 'Clínica Sorriso' }, primaryTypeDisplayName: { text: 'Dentista' },
    internationalPhoneNumber: '+55 11 98687-7681', websiteUri: 'https://instagram.com/sorriso',
    formattedAddress: 'Rua A, 10 - Centro, Jundiaí - SP', rating: 4.8, userRatingCount: 120,
    addressComponents: [
      { longText: 'Jundiaí', shortText: 'Jundiaí', types: ['administrative_area_level_2', 'political'] },
      { longText: 'São Paulo', shortText: 'SP', types: ['administrative_area_level_1', 'political'] },
    ],
    googleMapsUri: 'https://maps.google.com/?cid=1', businessStatus: 'OPERATIONAL',
  });
  igual(r.telefone, '5511986877681');
  igual(r.tipoTelefone, 'celular');
  igual(r.temSite, false, 'Instagram não é site próprio');
  igual(r.cidade, 'Jundiaí');
  igual(r.uf, 'SP');
  igual(b.converterLugar({ id: 'g2', nationalPhoneNumber: '(11) 4039-3981' }).tipoTelefone, 'fixo');
  igual(b.converterLugar({ id: 'g3' }).tipoTelefone, 'nenhum');
  verdadeiro(b.siteProprio('https://clinicasorriso.com.br'));
  falso(b.siteProprio('https://linktr.ee/x'));
});

teste('Buscador: marca quem já está no CRM, filtra e monta o lead', async () => {
  const b = await import('../js/busca-leads.js');
  const base = { tipoTelefone: 'celular', temSite: false, fechado: false };
  const resultados = b.marcarExistentes([
    { ...base, googleId: '1', nome: 'A', telefone: '5511986877681' },
    { ...base, googleId: '2', nome: 'B', telefone: '5511911112222', temSite: true, site: 'https://b.com.br' },
    { ...base, googleId: '3', nome: 'C', telefone: '551140393981', tipoTelefone: 'fixo' },
    { ...base, googleId: '4', nome: 'D', telefone: null, tipoTelefone: 'nenhum' },
    { ...base, googleId: '5', nome: 'E', telefone: '5511933334444', fechado: true },
    { ...base, googleId: '1', nome: 'A repetido', telefone: '5511986877681' },
  ], [{ nome: 'Já tenho', telefone: '5511986877681' }]);
  igual(resultados.length, 5, 'repetido some');
  igual(resultados[0].noCrm, 'Já tenho');
  igualProfundo(b.filtrarResultados(resultados, { esconderNoCrm: true }).map((r) => r.googleId), ['2', '3', '4']);
  igualProfundo(b.filtrarResultados(resultados, { semSite: true, soCelular: true }).map((r) => r.googleId), ['1']);
  igualProfundo(resultados.filter(b.podeAdicionar).map((r) => r.googleId), ['2', '3']);
  const lead = b.leadDoResultado({ ...resultados[2], cidade: 'Jundiaí', uf: 'SP', nota: 4.5, avaliacoes: 10 }, { segmento: 'Odontologia', vendedor_id: 'u1' });
  igual(lead.servico, 'Site institucional');
  igual(lead.origem, 'Google Maps');
  verdadeiro(lead.observacoes.includes('Telefone: Fixo') && lead.observacoes.includes('Sem site'));
  igual(validarLead(lead).valido, true, 'lead gerado passa na validação');
  igual(b.leadDoResultado(resultados[1], { segmento: 'X' }).servico, null, 'tem site: serviço a avaliar');
  igual(b.nichoDoTexto('dentistas / clínicas odontológicas').segmento, 'Odontologia');
  igual(b.nichoDoTexto('xyz'), null);
});
