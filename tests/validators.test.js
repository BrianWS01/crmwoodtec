// Testes de js/validators.js. Valores definidos aqui mesmo; nada é gravado no banco.
import { teste, igual, igualProfundo, verdadeiro, falso } from './harness.js';
import {
  validarCnpj, formatarCnpj, mascaraCnpj,
  normalizarTelefone, formatarTelefone, mascaraTelefone,
  normalizarServico, normalizarEtapa, normalizarTexto, chaveTexto,
  validarLead, dataIsoValida, hojeIso, formatarDataBr, followUpVencido, campoDoErroUnico,
} from '../js/validators.js';

// --- CNPJ -------------------------------------------------------------
teste('CNPJ: aceita válido com e sem máscara', () => {
  verdadeiro(validarCnpj('11.222.333/0001-81'), 'com máscara');
  verdadeiro(validarCnpj('11222333000181'), 'sem máscara');
});

teste('CNPJ: recusa dígito verificador errado, repetidos e tamanho errado', () => {
  falso(validarCnpj('11222333000182'), 'DV errado');
  falso(validarCnpj('11111111111111'), 'todos iguais');
  falso(validarCnpj('00000000000000'), 'zeros');
  falso(validarCnpj('1122233300018'), '13 dígitos');
  falso(validarCnpj(''), 'vazio');
  falso(validarCnpj(null), 'null');
});

teste('CNPJ: formatação e máscara progressiva', () => {
  igual(formatarCnpj('11222333000181'), '11.222.333/0001-81');
  igual(mascaraCnpj('11'), '11');
  igual(mascaraCnpj('11222'), '11.222');
  igual(mascaraCnpj('112223330'), '11.222.333/0');
  igual(mascaraCnpj('11222333000181999'), '11.222.333/0001-81', 'corta excesso');
  igual(mascaraCnpj('ab11.222'), '11.222', 'ignora letras');
});

// --- Telefone ---------------------------------------------------------
teste('Telefone: normaliza para 55 + DDD + número', () => {
  igual(normalizarTelefone('(11) 91234-5678'), '5511912345678', 'celular com máscara');
  igual(normalizarTelefone('11912345678'), '5511912345678', 'celular só dígitos');
  igual(normalizarTelefone('+55 11 91234-5678'), '5511912345678', 'com +55');
  igual(normalizarTelefone('011 91234-5678'), '5511912345678', 'com zero na frente');
  igual(normalizarTelefone('(11) 3123-4567'), '551131234567', 'fixo 8 dígitos');
  igual(normalizarTelefone('(55) 91234-5678'), '5555912345678', 'DDD 55 sem código do país');
});

teste('Telefone: recusa inválidos', () => {
  igual(normalizarTelefone('1234'), null, 'curto');
  igual(normalizarTelefone('(11) 81234-5678'), null, '9 dígitos sem começar com 9');
  igual(normalizarTelefone('(01) 91234-5678'), null, 'DDD inválido');
  igual(normalizarTelefone('(10) 91234-5678'), null, 'DDD com zero');
  igual(normalizarTelefone('(20) 91234-5678'), null, 'DDD que não existe');
  igual(normalizarTelefone('(11) 1234-5678'), null, 'fixo começando com 1');
  igual(normalizarTelefone('44 11 91234-5678'), null, '13 dígitos sem 55');
  igual(normalizarTelefone(''), null, 'vazio');
});

teste('Telefone: formatação e máscara progressiva', () => {
  igual(formatarTelefone('5511912345678'), '(11) 91234-5678');
  igual(formatarTelefone('551131234567'), '(11) 3123-4567');
  igual(mascaraTelefone('1'), '(1');
  igual(mascaraTelefone('113123'), '(11) 3123');
  igual(mascaraTelefone('1131234567'), '(11) 3123-4567');
  igual(mascaraTelefone('11912345678'), '(11) 91234-5678');
  igual(mascaraTelefone('+55 11 91234-5678'), '(11) 91234-5678', 'colado com +55');
});

// --- Serviço e etapa --------------------------------------------------
teste('Serviço: sinônimos viram o valor oficial', () => {
  igual(normalizarServico('LP'), 'Landing page');
  igual(normalizarServico('landing page'), 'Landing page');
  igual(normalizarServico('ecommerce'), 'E-commerce');
  igual(normalizarServico('E-Commerce'), 'E-commerce');
  igual(normalizarServico('Loja virtual completa'), 'E-commerce');
  igual(normalizarServico('catálogo'), 'Catálogo');
  igual(normalizarServico('site'), 'Site institucional');
  igual(normalizarServico('Automação'), 'Automação');
  igual(normalizarServico('sistema'), 'SaaS avulso');
  igual(normalizarServico('quero um app'), 'SaaS avulso');
});

teste('Serviço: não reconhece texto sem relação', () => {
  igual(normalizarServico('Clínica de botox'), null, 'não confunde "bot"');
  igual(normalizarServico('xyz'), null);
  igual(normalizarServico(''), null);
});

teste('Etapa: variações de escrita', () => {
  igual(normalizarEtapa('reuniao marcada'), 'Reunião marcada');
  igual(normalizarEtapa('FECHADO'), 'Fechado');
  igual(normalizarEtapa('mensagem-enviada'), 'Mensagem enviada');
  igual(normalizarEtapa('qualquer'), null);
});

teste('Texto: normalização', () => {
  igual(normalizarTexto('  Clínica   Médica '), 'clinica medica');
  igual(chaveTexto('E-Commerce'), 'ecommerce');
});

// --- Datas ------------------------------------------------------------
teste('Datas: validação, formatação e vencimento', () => {
  verdadeiro(dataIsoValida('2024-02-29'), 'bissexto');
  falso(dataIsoValida('2026-02-30'), '30 de fevereiro');
  falso(dataIsoValida('25/09/2026'), 'formato BR');
  igual(hojeIso(new Date(2026, 8, 5)), '2026-09-05');
  igual(formatarDataBr('2026-09-25'), '25/09/2026');
  igual(formatarDataBr(''), '');
  verdadeiro(followUpVencido('2026-09-24', '2026-09-25'), 'ontem');
  falso(followUpVencido('2026-09-25', '2026-09-25'), 'hoje');
  falso(followUpVencido(null, '2026-09-25'), 'sem data');
});

// --- Lead completo ----------------------------------------------------
teste('Lead: mínimo válido é normalizado', () => {
  const { valido, erros, lead } = validarLead({
    nome: '  Empresa Teste ', telefone: '(11) 91234-5678', segmento: 'Petshop', cnpj: '', servico: 'LP',
  });
  verdadeiro(valido, JSON.stringify(erros));
  igual(lead.nome, 'Empresa Teste');
  igual(lead.telefone, '5511912345678');
  igual(lead.cnpj, null);
  igual(lead.servico, 'Landing page');
  igual(lead.etapa, 'Novo', 'etapa padrão');
  igual(lead.responsavel, null);
});

teste('Lead: obrigatórios faltando', () => {
  const { valido, erros } = validarLead({});
  falso(valido);
  igualProfundo(Object.keys(erros).sort(), ['nome', 'segmento', 'telefone']);
});

teste('Lead: CNPJ, etapa e data inválidos', () => {
  const { erros, lead } = validarLead({
    nome: 'X', telefone: '11912345678', segmento: 'Y',
    cnpj: '11.222.333/0001-82', etapa: 'Inventada', follow_up_em: '2026-02-30',
  });
  verdadeiro(erros.cnpj, 'cnpj');
  verdadeiro(erros.etapa, 'etapa');
  verdadeiro(erros.follow_up_em, 'data');
  igual(lead.cnpj, '11222333000182', 'cnpj guardado só com dígitos');
});

teste('Lead: CNPJ com menos de 14 dígitos', () => {
  const { erros } = validarLead({ nome: 'X', telefone: '11912345678', segmento: 'Y', cnpj: '123' });
  igual(erros.cnpj, 'O CNPJ precisa ter 14 dígitos.');
});

// --- Erro de unique do banco -----------------------------------------
teste('Erro 23505: identifica o campo pelo nome do índice', () => {
  igual(campoDoErroUnico({ code: '23505', message: 'duplicate key value violates unique constraint "leads_user_cnpj_uniq"' }), 'cnpj');
  igual(campoDoErroUnico({ code: '23505', message: 'duplicate key value violates unique constraint "leads_user_telefone_uniq"' }), 'telefone');
  igual(campoDoErroUnico({ code: '23514', message: 'leads_user_cnpj_uniq' }), null, 'outro código');
  igual(campoDoErroUnico(null), null);
});
