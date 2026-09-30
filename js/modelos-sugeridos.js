// Modelos de mensagem prontos, criados pelo botão "Criar modelos sugeridos" em Configurações.
// Os gatilhos (etapa / segmento / serviço) fazem o CRM escolher o modelo sozinho.
// Modelos sem gatilho (menos o padrão) ficam para escolher na mão no envio.
// Módulo puro: só dados.

export const MODELOS_SUGERIDOS = [
  // --- Padrão (qualquer lead) ---------------------------------------------
  {
    titulo: 'Geral — primeiro contato',
    padrao: true,
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. A gente ajuda empresas a conseguir mais clientes pela internet, '
      + 'com site, página de captação e automação no WhatsApp.\n\n'
      + 'Posso te mostrar em 2 minutos uma ideia para a {empresa}?',
  },

  // --- 1º contato por serviço -------------------------------------------------
  {
    titulo: '1º contato — sem site',
    etapa_gatilho: 'Novo',
    servico_gatilho: 'Site institucional',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. Procurei a {empresa} no Google e não encontrei um site de vocês.\n\n'
      + 'Hoje a maioria das pessoas pesquisa antes de agendar, e quem não aparece acaba perdendo esse cliente '
      + 'para o concorrente. A gente cria sites rápidos, bonitos e com botão direto para o WhatsApp.\n\n'
      + 'Posso te mandar um exemplo de como ficaria o de vocês?',
  },
  {
    titulo: '1º contato — landing page',
    etapa_gatilho: 'Novo',
    servico_gatilho: 'Landing page',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. Trabalhamos com páginas de captação: uma página única, direta, '
      + 'feita para transformar quem chega do Instagram ou do Google em contato no WhatsApp.\n\n'
      + 'Para profissionais como você costuma funcionar muito bem. Quer que eu te mostre um modelo?',
  },
  {
    titulo: '1º contato — catálogo / loja',
    etapa_gatilho: 'Novo',
    servico_gatilho: 'E-commerce',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. Vi os produtos da {empresa} e pensei num catálogo online, '
      + 'onde o cliente escolhe os itens e o pedido já chega pronto no seu WhatsApp.\n\n'
      + 'Economiza tempo de atendimento e passa mais profissionalismo. Posso te mandar um exemplo?',
  },
  {
    titulo: '1º contato — catálogo digital',
    etapa_gatilho: 'Novo',
    servico_gatilho: 'Catálogo',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. Fazemos catálogos digitais: um link com todos os seus produtos, '
      + 'fotos e preços, que o cliente abre no celular e já pede pelo WhatsApp.\n\n'
      + 'Chega de mandar foto por foto. Quer ver como ficaria para a {empresa}?',
  },
  {
    titulo: '1º contato — automação',
    etapa_gatilho: 'Novo',
    servico_gatilho: 'Automação',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. A gente automatiza o atendimento no WhatsApp: '
      + 'responde as dúvidas comuns, agenda horários e envia lembretes sozinho, 24 horas por dia.\n\n'
      + 'Vocês perdem tempo respondendo sempre as mesmas perguntas aí na {empresa}?',
  },

  // --- 1º contato por segmento (vence o de serviço) ----------------------------
  {
    titulo: '1º contato — veterinária',
    etapa_gatilho: 'Novo',
    segmento_gatilho: 'Veterinária',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. Estamos ajudando clínicas veterinárias da região a aparecer no Google '
      + 'quando alguém pesquisa "veterinário perto de mim", com um site que leva direto para o WhatsApp.\n\n'
      + 'Posso te mostrar como ficaria para a {empresa}?',
  },
  {
    titulo: '1º contato — odontologia',
    etapa_gatilho: 'Novo',
    segmento_gatilho: 'Odontologia',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. Trabalhamos com clínicas odontológicas criando sites e páginas '
      + 'para tratamentos como implante, clareamento e ortodontia, com agendamento direto pelo WhatsApp.\n\n'
      + 'Posso te mandar um exemplo que fizemos para outra clínica?',
  },
  {
    titulo: '1º contato — estética',
    etapa_gatilho: 'Novo',
    segmento_gatilho: 'Estética',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. Vi o trabalho da {empresa} e acho que dá para atrair bem mais '
      + 'clientes com uma página mostrando os procedimentos, antes e depois e agendamento pelo WhatsApp.\n\n'
      + 'Quer que eu te mostre uma ideia?',
  },
  {
    titulo: '1º contato — psicologia',
    etapa_gatilho: 'Novo',
    segmento_gatilho: 'Psicologia',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. Crio páginas profissionais para psicólogos: apresentação, '
      + 'abordagem, formas de atendimento (presencial e online) e um botão para o paciente agendar pelo WhatsApp, '
      + 'tudo dentro das orientações do CFP.\n\n'
      + 'Faz sentido eu te mostrar um exemplo?',
  },
  {
    titulo: '1º contato — podologia',
    etapa_gatilho: 'Novo',
    segmento_gatilho: 'Podologia',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. Muita gente procura podólogo no Google quando está com dor e quer '
      + 'resolver rápido. Um site simples, com os serviços e botão de WhatsApp, faz a {empresa} ser encontrada nessa hora.\n\n'
      + 'Posso te mostrar como ficaria?',
  },
  {
    titulo: '1º contato — fisioterapia',
    etapa_gatilho: 'Novo',
    segmento_gatilho: 'Fisioterapia',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. Ajudamos clínicas de fisioterapia a receber mais pacientes '
      + 'particulares com um site que explica os tratamentos e leva direto para o agendamento no WhatsApp.\n\n'
      + 'Quer ver um exemplo?',
  },

  // --- Situações específicas (escolher na mão) ---------------------------------
  {
    titulo: 'Site fora do ar',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. Tentei acessar o site da {empresa} e ele não está abrindo. '
      + 'Quem procura vocês no Google pode estar desistindo por causa disso.\n\n'
      + 'Se quiser, dou uma olhada no que aconteceu e te passo o caminho para resolver. Sem compromisso.',
  },
  {
    titulo: 'Site desatualizado',
    texto: '{saudacao}, {responsavel}! Tudo bem?\n\n'
      + 'Me chamo {vendedor}, sou da WoodTec. Dei uma olhada no site da {empresa}: ele funciona, mas no celular '
      + 'fica difícil de navegar e não tem um caminho claro para o cliente chamar no WhatsApp.\n\n'
      + 'Posso te mostrar em 2 minutos o que mudaria para ele trazer mais contatos?',
  },

  // --- Sequência depois do 1º contato ------------------------------------------
  {
    titulo: 'Cobrança — sem resposta',
    etapa_gatilho: 'Mensagem enviada',
    texto: '{saudacao}, {responsavel}! Passando para saber se conseguiu ver minha mensagem.\n\n'
      + 'Se fizer sentido, te mando um exemplo do que fizemos para outra empresa de {segmento}. Pode ser?',
  },
  {
    titulo: 'Última tentativa',
    texto: '{saudacao}, {responsavel}! Não quero encher sua caixa de mensagens, então essa é a última.\n\n'
      + 'Se em algum momento quiser trazer mais clientes para a {empresa} pela internet, é só me chamar aqui. '
      + 'Sucesso para vocês!',
  },
  {
    titulo: 'Respondeu — marcar conversa',
    etapa_gatilho: 'Respondeu',
    texto: 'Que bom, {responsavel}!\n\n'
      + 'Para eu te mostrar certinho, prefere uma chamada rápida de 15 minutos ou que eu mande por aqui mesmo?\n\n'
      + 'Se for chamada, qual o melhor dia e horário para você?',
  },
  {
    titulo: 'Confirmação de reunião',
    etapa_gatilho: 'Reunião marcada',
    texto: '{saudacao}, {responsavel}! Tudo certo para a nossa conversa?\n\n'
      + 'Vou te mostrar as ideias que separei para a {empresa}. Se precisar mudar o horário, é só me avisar por aqui.',
  },
  {
    titulo: 'Retorno da proposta',
    etapa_gatilho: 'Proposta enviada',
    texto: '{saudacao}, {responsavel}! Conseguiu dar uma olhada na proposta para a {empresa}?\n\n'
      + 'Fico à disposição para ajustar o que precisar ou tirar qualquer dúvida.',
  },
  {
    titulo: 'Pedido de indicação',
    texto: '{saudacao}, {responsavel}! Espero que esteja gostando do resultado.\n\n'
      + 'Você conhece mais alguém que também precisa de site ou de mais clientes pela internet? '
      + 'Se puder me indicar, vou cuidar com o mesmo carinho.',
  },
];

/** Opção fixa da janela de envio: texto em branco com a saudação, para escrever do zero. */
export const MODELO_LIVRE = {
  id: '__livre',
  titulo: '✏️ Mensagem livre (escrever do zero)',
  texto: '{saudacao}, {responsavel}!\n\n',
};
