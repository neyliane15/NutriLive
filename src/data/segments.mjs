/* =========================================================================
   Nutri&Live — content for the three audiences
   ========================================================================= */

export const content = {

  /* ==================== PESSOA FÍSICA ==================== */
  voce: {
    key: "voce",
    slug: "index.html",
    navLabel: "Para você",
    title: "Nutri&Live — plano alimentar, receitas e evolução em um app só",
    metaDesc:
      "Plano alimentar feito pra sua rotina, lista de compras pronta e sua evolução em um lugar só. A partir de R$ 19,90/mês no Pix, cartão de crédito ou débito. Cancele quando quiser.",
    screen: "home",
    heroScreen2: "compras",

    hero: {
      badge: "Novo: plano alimentar em 40 segundos",
      title: ["Comer bem virou a", { hl: "parte fácil" }, "do seu dia."],
      lead:
        "Um plano alimentar do seu jeito, a lista de compras já pronta e o seu progresso num lugar só. Sem planilha, sem culpa, sem adivinhação.",
      bullets: [
        "Plano alimentar em segundos, com o que você já gosta de comer",
        "Lista de compras com preço estimado, pronta pro mercado",
        "Peso, medidas e energia acompanhados sem esforço"
      ],
      primary: { label: "Começar por R$ 19,90/mês", href: "checkout.html?seg=voce&plan=plus" },
      secondary: { label: "Ver como funciona", href: "#como-funciona" },
      proof: "Plano, receitas e lista de compras **em um app só**"
    },

    tiles: [
      { icon: "clipboard", title: "Plano alimentar", text: "De 1, 3 ou 7 dias, com o que você já gosta de comer.", href: "#recursos" },
      { icon: "book", title: "Receitas inteligentes", text: "Diz o que tem em casa e sai o jantar, com os macros contados.", href: "#recursos" },
      { icon: "cart", title: "Lista de compras", text: "Sai do plano pro mercado, com quantidade e preço estimado.", href: "#recursos" },
      { icon: "trend", title: "Minha evolução", text: "Peso, medidas e constância em gráficos que fazem sentido.", href: "#recursos" },
      { icon: "users", title: "Seu nutri junto", text: "Conecte a sua nutricionista e ela acompanha tudo pelo painel.", href: "nutricionistas.html" }
    ],
    band: {
      title: "Assinar é fácil. Cancelar também.",
      text: "Sem fidelidade, sem multa e sem aquela ligação de retenção. Você cancela em dois toques dentro do app, e ainda tem 30 dias para pedir tudo de volta.",
      cta: { label: "Ver os planos", href: "#planos" },
      screen: "home"
    },
    stats: [
      { num: "2,4 mi", label: "refeições registradas nos últimos 12 meses" },
      { num: "40s", label: "para montar o plano, as receitas e a lista de compras" }
    ],

    showcases: [
      {
        eyebrow: "Plano alimentar",
        title: "Um plano que cabe na sua semana de verdade.",
        text:
          "Diga o seu objetivo, o que você não come e quanto tempo tem pra cozinhar. Em segundos você recebe um plano de 1, 3 ou 7 dias com porções, calorias e macros calculados.",
        list: [
          ["Onívoro, vegetariano, vegano, low carb, sem lactose", "e mais 14 preferências"],
          ["Recalcula sozinho", "quando você troca uma refeição"],
          ["Revisado por nutricionistas", "do nosso time clínico"]
        ],
        screen: "plano",
        flip: false
      },
      {
        eyebrow: "Receitas inteligentes",
        title: "Diz o que tem na geladeira. A gente resolve o jantar.",
        text:
          "Peito de frango, batata-doce e cenoura? Em três segundos aparecem receitas com o tempo de preparo, o modo de fazer e os macros já contados.",
        list: [
          ["Filtra por tempo", "— tem receita de 10, 20 e 30 minutos"],
          ["Aproveita o que sobrou", "e corta o desperdício da semana"],
          ["Salva as favoritas", "e reaproveita no próximo plano"]
        ],
        screen: "receitas",
        flip: true
      },
      {
        eyebrow: "Minha evolução",
        title: "O progresso que a balança sozinha não mostra.",
        text:
          "Peso, cintura, quadril, braço, hidratação, energia. Tudo em gráficos limpos, do dia até o ano inteiro — pra você ver o caminho, não só o número de hoje.",
        list: [
          ["7 dias, 30 dias, 3 e 6 meses, 1 ano", "no mesmo gráfico"],
          ["Fotos de evolução", "guardadas de forma privada"],
          ["Exporte em PDF", "e leve para a sua consulta"]
        ],
        screen: "evolucao",
        flip: false
      }
    ],

    steps: [
      { title: "Conte o seu objetivo", text: "Dois minutos de perguntas simples: rotina, restrições, o que você gosta e o que quer alcançar." },
      { title: "Receba o seu plano", text: "Plano alimentar, lista de compras e receitas prontas — tudo calculado para o seu corpo e a sua semana." },
      { title: "Siga e ajuste", text: "Registre, troque o que não deu certo e veja a evolução. O plano acompanha a sua vida, não o contrário." }
    ],

    features: [
      { icon: "droplet", title: "Hidratação", text: "Meta de água calculada pelo seu peso, com lembretes que não enchem o saco." },
      { icon: "flame", title: "Calorias e macros", text: "Proteínas, carboidratos e gorduras contados sem você precisar pesar tudo." },
      { icon: "target", title: "Score diário", text: "Uma nota simples de 0 a 100 que mostra como foi o seu dia. Sem punição." },
      { icon: "download", title: "Seus dados são seus", text: "Exporte tudo em PDF ou CSV a qualquer momento. Sem pedir permissão." }
    ],

    plansNote: "Preços por pessoa. Sem fidelidade, sem taxa de adesão.",
    plans: [
      {
        name: "Essencial",
        desc: "Para organizar a alimentação do dia a dia.",
        monthly: 1990, yearly: 1590,
        cta: "Assinar Essencial", planKey: "essencial",
        features: [
          "Diário alimentar e de hidratação",
          "Score diário de saúde",
          "3 receitas inteligentes por dia",
          "Metas de peso e medidas",
          "Histórico de 90 dias"
        ],
        off: ["Plano alimentar gerado por IA", "Lista de compras automática"]
      },
      {
        name: "Plus",
        desc: "O plano completo — e o que quase todo mundo escolhe.",
        monthly: 3990, yearly: 3190,
        featured: true, flag: "Mais escolhido",
        cta: "Assinar Plus", planKey: "plus",
        features: [
          "Tudo do Essencial",
          "Plano alimentar ilimitado de 1, 3 ou 7 dias",
          "Receitas inteligentes ilimitadas",
          "Lista de compras com preço estimado",
          "Evolução completa: medidas, fotos e gráficos",
          "Exportação em PDF para o seu nutri",
          "Histórico ilimitado"
        ]
      },
      {
        name: "Família",
        desc: "Até 5 perfis, cada um com o seu plano.",
        monthly: 5990, yearly: 4790,
        cta: "Assinar Família", planKey: "familia",
        features: [
          "Tudo do Plus, para 5 pessoas",
          "Perfis independentes e privados",
          "Lista de compras unificada da casa",
          "Perfil infantil com porções ajustadas",
          "Uma única cobrança no mês"
        ]
      }
    ],

    testimonials: [
      { text: "Eu já tinha tentado três apps antes. O que mudou aqui foi a lista de compras — eu chego no mercado e não invento moda. Perdi 7 kg em cinco meses sem passar fome.", name: "Ana Prudente", role: "Analista de dados · São Paulo, SP", initials: "AP" },
      { text: "Sou péssima pra cozinhar. Digito o que tem na geladeira e ele resolve. Meu marido acha que eu virei chef.", name: "Camila Reis", role: "Professora · Recife, PE", initials: "CR" },
      { text: "O que me pegou foi o gráfico de medidas. A balança travou por três semanas, mas a cintura continuou caindo. Se eu só olhasse o peso, tinha desistido.", name: "Rodrigo Salles", role: "Motorista de app · Curitiba, PR", initials: "RS" }
    ],

    faq: [
      { q: "Posso cancelar quando quiser?", a: "Pode, em dois toques dentro do app, em Menu › Assinatura › Cancelar. Sem ligação, sem retenção, sem multa. Você continua com acesso até o fim do período que já pagou." },
      { q: "Como funciona a cobrança mensal?", a: "No cartão de crédito ou débito, a cobrança é automática todo mês na mesma data, com aviso por e-mail 3 dias antes. No Pix, a gente manda o código na véspera do vencimento e você paga quando quiser — se não pagar, a assinatura só pausa, nada é cobrado à força." },
      { q: "Isso substitui um nutricionista?", a: "Não, e não queremos substituir. O Nutri&Live organiza, calcula e lembra — o julgamento clínico é de um profissional. Se você já tem nutricionista, dá pra conectar o seu perfil ao painel dela sem custo nenhum a mais." },
      { q: "Funciona pra quem tem restrição alimentar?", a: "Sim. Dá pra marcar restrições (lactose, glúten, frutos do mar, oleaginosas e outras), alergias e o que você simplesmente não gosta. O plano nunca sugere um ingrediente que você bloqueou." },
      { q: "Preciso pesar tudo o que como?", a: "Não. Você pode registrar por porção caseira — 'um prato', 'meia concha', 'uma fatia'. A precisão cai um pouco, a constância sobe muito, e é a constância que traz resultado." },
      { q: "Meus dados de saúde ficam seguros?", a: "Ficam criptografados em repouso com AES-256 e em trânsito com TLS 1.3, em servidores no Brasil. Nunca vendemos, alugamos ou compartilhamos dados com anunciantes. Você pode exportar ou apagar tudo pelo app." },
      { q: "Posso trocar de plano depois?", a: "A qualquer momento. Subiu de plano, a diferença é calculada proporcionalmente. Desceu, o crédito fica pros próximos meses. Nada se perde no caminho." }
    ],

    finalCta: {
      title: "Comece hoje. Cancele quando quiser.",
      text: "R$ 19,90 no primeiro mês e o seu plano pronto antes do café esfriar.",
      primary: { label: "Criar meu plano agora", href: "checkout.html?seg=voce&plan=plus" },
      secondary: { label: "Falar no WhatsApp", href: "https://wa.me/5511400012340" }
    }
  },

  /* ==================== NUTRICIONISTA ==================== */
  nutri: {
    key: "nutri",
    slug: "nutricionistas.html",
    navLabel: "Para nutricionistas",
    title: "Nutri&Live para nutricionistas — planos em minutos e adesão em tempo real",
    metaDesc:
      "Monte planos alimentares em minutos, acompanhe a adesão do paciente em tempo real e fidelize com o seu nome no app. A partir de R$ 79,90/mês. Pix, crédito ou débito.",
    screen: "dashboard",
    heroScreen2: "acompanhamento",

    hero: {
      badge: "Feito com nutricionistas, para nutricionistas",
      title: ["Mais tempo com o paciente.", { hl: "Menos tempo" }, "na planilha."],
      lead:
        "Monte o plano em minutos, veja quem está seguindo em tempo real e apareça no celular do paciente com o seu nome. Sem sistema pela metade, sem PDF perdido no WhatsApp.",
      bullets: [
        "Plano alimentar completo em 4 minutos, com a sua assinatura clínica",
        "Painel de adesão: quem registrou, quem sumiu, quem precisa de você",
        "O app do paciente conectado ao seu acompanhamento, sem PDF solto"
      ],
      primary: { label: "Testar 14 dias grátis", href: "checkout.html?seg=nutri&plan=profissional" },
      secondary: { label: "Ver o painel por dentro", href: "#como-funciona" },
      proof: "Feito sobre a **Resolução CFN nº 599/2018** · a prescrição continua sendo sua"
    },

    tiles: [
      { icon: "users", title: "Painel de pacientes", text: "Ordenado por risco de abandono, com a adesão da semana.", href: "#recursos" },
      { icon: "clipboard", title: "Prescrição em minutos", text: "Rascunho calculado, você revisa e envia com o seu nome.", href: "#recursos" },
      { icon: "scale", title: "Antropometria", text: "Dobras, circunferências e composição corporal com gráficos.", href: "#recursos" },
      { icon: "chart", title: "Relatórios de adesão", text: "Por paciente ou pela carteira inteira, semana a semana.", href: "#recursos" },
      { icon: "chat", title: "Mensagens no app", text: "Fale com o paciente sem misturar com o seu WhatsApp pessoal.", href: "#recursos" }
    ],
    band: {
      title: "Teste 14 dias. Sem cartão, sem pegadinha.",
      text: "Você cria a conta, migra uma paciente e monta o primeiro plano hoje. Se não fizer sentido, é só não assinar — não pedimos cartão para começar.",
      cta: { label: "Começar teste grátis", href: "checkout.html?seg=nutri&plan=profissional" },
      screen: "dashboard"
    },
    stats: [
      { num: "4 min", label: "para montar um plano completo, em média" },
      { num: "+63%", label: "de adesão do paciente entre consultas" },
      { num: "9,2 h", label: "economizadas por mês em tarefas repetidas" }
    ],

    showcases: [
      {
        eyebrow: "Painel do nutricionista",
        title: "Você abre o painel e já sabe quem precisa de você.",
        text:
          "A lista de pacientes ordenada por risco de abandono, com o último registro, a adesão da semana e o que mudou desde a última consulta. Nada de abrir dez conversas para descobrir.",
        list: [
          ["Alertas de queda de adesão", "antes do paciente sumir"],
          ["Prontuário, antropometria e recordatório", "no mesmo lugar"],
          ["Notas privadas e evolução clínica", "com histórico datado"]
        ],
        screen: "dashboard",
        flip: false
      },
      {
        eyebrow: "Prescrição",
        title: "O plano sai pronto. Você faz o que só você sabe fazer.",
        text:
          "Escolha o objetivo, as calorias e as preferências: o rascunho aparece com porções, macros e substituições. Você revisa, ajusta o que quiser e envia — com o seu nome em cada página.",
        list: [
          ["Tabela TACO e IBGE/POF", "como base de cálculo"],
          ["Substituições equivalentes", "geradas automaticamente"],
          ["PDF pronto para imprimir", "ou envio direto pro app do paciente"]
        ],
        screen: "plano",
        flip: true
      },
      {
        eyebrow: "Entre consultas",
        title: "O acompanhamento continua depois que o paciente sai da sala.",
        text:
          "Ele registra as refeições, você vê. Ele trava numa receita, você ajusta à distância. A lista de compras chega atualizada no celular dele, sem você reenviar nada.",
        list: [
          ["Ajuste o plano à distância", "e o app do paciente atualiza na hora"],
          ["Mensagens dentro do app", "sem misturar com o seu WhatsApp pessoal"],
          ["Relatório de consulta", "gerado em um clique antes do retorno"]
        ],
        screen: "acompanhamento",
        flip: false
      }
    ],

    steps: [
      { title: "Traga os seus pacientes", text: "Importe por planilha ou convide por link. Em uma tarde você migra a agenda inteira." },
      { title: "Prescreva em minutos", text: "Gere o rascunho, ajuste com o seu olhar clínico e envie para o paciente." },
      { title: "Acompanhe e retenha", text: "Veja adesão em tempo real, aja antes do abandono e chegue no retorno já sabendo de tudo." }
    ],

    features: [
      { icon: "clipboard", title: "Prontuário completo", text: "Anamnese, antropometria, exames e evolução clínica com histórico datado." },
      { icon: "calendar", title: "Agenda e retornos", text: "Lembrete automático de retorno para o paciente e para você." },
      { icon: "users", title: "Multiprofissional", text: "Divida a carteira com sócias e estagiárias, com permissão por papel." },
      { icon: "shield", title: "Sigilo profissional", text: "Trilha de auditoria de quem acessou cada prontuário, e quando." },
      { icon: "download", title: "Saída sem amarras", text: "Exporte toda a sua base em CSV e PDF quando quiser. Sem reter refém." }
    ],

    plansNote: "14 dias grátis em qualquer plano. Sem cartão para testar, sem fidelidade.",
    plans: [
      {
        name: "Início",
        desc: "Para quem está montando o consultório.",
        monthly: 7990, yearly: 6390,
        cta: "Começar teste grátis", planKey: "inicio",
        features: [
          "Até 15 pacientes ativos",
          "Planos alimentares ilimitados",
          "Prontuário e antropometria",
          "App do paciente incluso",
          "Suporte por e-mail"
        ],
        off: ["Relatórios de adesão", "Agenda com lembrete de retorno"]
      },
      {
        name: "Profissional",
        desc: "Para o consultório que já lotou a agenda.",
        monthly: 14990, yearly: 11990,
        featured: true, flag: "Mais escolhido",
        cta: "Começar teste grátis", planKey: "profissional",
        features: [
          "Até 60 pacientes ativos",
          "Tudo do Início",
          "Relatórios de adesão e de risco de abandono",
          "Agenda com lembrete de retorno",
          "Mensagens dentro do app",
          "Suporte por WhatsApp em até 4 h"
        ]
      },
      {
        name: "Clínica",
        desc: "Para times com mais de um profissional.",
        monthly: 29990, yearly: 23990,
        cta: "Começar teste grátis", planKey: "clinica",
        features: [
          "Pacientes ilimitados",
          "Até 5 nutricionistas na mesma conta",
          "Tudo do Profissional",
          "Permissões por papel e trilha de auditoria",
          "Relatórios consolidados da clínica",
          "API e integração com o seu sistema",
          "Gerente de conta dedicado"
        ]
      }
    ],

    testimonials: [
      { text: "Eu levava quase uma hora por plano no Excel. Hoje levo quatro minutos e o material sai muito melhor do que eu conseguia fazer sozinha.", name: "Dra. Marina Falcão", role: "CRN-3 12.884 · São Paulo, SP", initials: "MF" },
      { text: "O alerta de queda de adesão salvou umas quinze pacientes esse ano. Eu mando uma mensagem no terceiro dia sem registro e elas voltam.", name: "Dra. Letícia Amaral", role: "CRN-8 5.109 · Londrina, PR", initials: "LA" },
      { text: "O relatório de consulta pronto antes do retorno mudou o meu dia. Eu chego na sessão já sabendo o que aconteceu nas últimas quatro semanas.", name: "Dr. Thiago Nunes", role: "CRN-6 9.472 · Fortaleza, CE", initials: "TN" }
    ],

    faq: [
      { q: "O Nutri&Live prescreve no meu lugar?", a: "Não. O sistema gera um rascunho calculado a partir dos parâmetros que você define; nada vai para o paciente sem a sua revisão e o seu envio. A prescrição continua sendo um ato privativo seu, com o seu CRN." },
      { q: "Como funcionam os 14 dias grátis?", a: "Você cria a conta sem cartão, usa tudo do plano escolhido por 14 dias e só decide depois. Se não quiser seguir, é só não assinar — não cobramos nada e não há surpresa no cartão." },
      { q: "Meus pacientes precisam pagar alguma coisa?", a: "Não. O app do paciente está incluso na sua assinatura, sem custo por paciente. Se o paciente já for assinante pessoa física, os dois perfis se conectam e ele não paga duas vezes." },
      { q: "Consigo migrar a minha base atual?", a: "Sim. Importe por planilha (CSV ou XLSX) ou convide por link. Para o plano Clínica, a nossa equipe faz a migração para você, sem custo." },
      { q: "E se eu passar do limite de pacientes?", a: "A gente avisa quando você chega em 80% e você decide: sobe de plano ou arquiva pacientes inativos. Nunca bloqueamos o acesso a um prontuário existente sem avisar antes." },
      { q: "Atende às exigências do CFN e da LGPD?", a: "O sistema foi desenhado com base na Resolução CFN nº 599/2018 e na LGPD: sigilo profissional, guarda de prontuário, trilha de auditoria de acesso, consentimento do paciente e direito de portabilidade. O termo do paciente é coletado no primeiro acesso." },
      { q: "Posso cancelar e levar meus dados?", a: "Sim, e sem ligação. Cancelou, você mantém acesso até o fim do período pago e pode exportar prontuários, planos e evolução em PDF e CSV por mais 90 dias." },
      { q: "Emitem nota fiscal?", a: "Todo mês, automaticamente, no CNPJ ou CPF que você cadastrar. A NFS-e chega por e-mail e fica salva no painel financeiro da sua conta." }
    ],

    finalCta: {
      title: "Teste 14 dias. Sem cartão, sem pegadinha.",
      text: "Migre uma paciente hoje e veja a diferença já no primeiro plano que você montar.",
      primary: { label: "Começar teste grátis", href: "checkout.html?seg=nutri&plan=profissional" },
      secondary: { label: "Agendar uma demonstração", href: "https://wa.me/5511400012340" }
    }
  },

  /* ==================== ACADEMIA ==================== */
  academia: {
    key: "academia",
    slug: "academias.html",
    navLabel: "Para academias",
    title: "Nutri&Live para academias — nutrição para toda a base, menos cancelamento",
    metaDesc:
      "Ative acompanhamento nutricional para todos os alunos, reduza cancelamento e crie uma nova linha de receita. A partir de R$ 249/mês. Pix, crédito, débito ou boleto.",
    screen: "academia",
    heroScreen2: "whitelabel",

    hero: {
      badge: "Nova receita recorrente para a sua unidade",
      title: ["O treino traz o aluno.", { hl: "A nutrição" }, "faz ele ficar."],
      lead:
        "Ative acompanhamento alimentar para a base inteira em um clique. Menos cancelamento, mais resultado visível — e uma linha de receita nova que roda sozinha.",
      bullets: [
        "Nutrição para todos os alunos, sem contratar um nutricionista por unidade",
        "Painel de engajamento por aluno, professor e unidade",
        "Revenda com a sua marca e fique com a margem"
      ],
      primary: { label: "Falar com vendas", href: "checkout.html?seg=academia&plan=academia" },
      secondary: { label: "Ver os números", href: "#numeros" },
      proof: "**212 unidades** ativas · redes de 1 a 40 academias"
    },

    tiles: [
      { icon: "building", title: "Ativação em massa", text: "Importe a base do seu sistema e convide todo mundo de uma vez.", href: "#recursos" },
      { icon: "trend", title: "Risco de cancelamento", text: "Cruzamos frequência e registro alimentar para avisar antes.", href: "#recursos" },
      { icon: "chart", title: "Painel da rede", text: "Engajamento por unidade, por professor e por aluno.", href: "#recursos" },
      { icon: "camera", title: "Whitelabel", text: "App, e-mail e PDF com a sua marca. O aluno vê a academia.", href: "#recursos" },
      { icon: "gear", title: "Integrações", text: "Tecnofit, Pacto, EVO, Next Fit e W12 — ou a nossa API.", href: "#recursos" }
    ],
    band: {
      title: "O aluno que come bem treina mais tempo.",
      text: "Entre os alunos que ativam nutrição, o cancelamento cai 31% e a permanência média sobe 2,7 meses. É retenção que aparece no caixa.",
      cta: { label: "Falar com vendas", href: "checkout.html?seg=academia&plan=academia" },
      screen: "academia"
    },
    stats: [
      { num: "212", label: "unidades usando o Nutri&Live hoje" },
      { num: "−31%", label: "de cancelamento entre alunos que ativam nutrição" },
      { num: "+2,7 m", label: "a mais de permanência média do aluno" },
      { num: "R$ 41", label: "de receita adicional por aluno ativo/mês" }
    ],

    showcases: [
      {
        eyebrow: "Ativação em massa",
        title: "Toda a base com nutrição em uma tarde.",
        text:
          "Importe a lista de alunos do seu sistema de gestão, escolha quem entra e dispare os convites. O aluno instala, responde 2 minutos de perguntas e já sai com plano.",
        list: [
          ["Integração com Tecnofit, Pacto, Evo e Next Fit", "ou CSV"],
          ["Convite por e-mail, SMS ou QR na recepção", "— você escolhe"],
          ["Onboarding do aluno em 2 minutos", "sem fila na recepção"]
        ],
        screen: "academia",
        flip: false
      },
      {
        eyebrow: "Painel da rede",
        title: "Engajamento por unidade, por professor, por aluno.",
        text:
          "Veja quem ativou, quem está registrando e quem esfriou. Cruze com a frequência do catraca e descubra o aluno em risco antes de ele pedir o cancelamento.",
        list: [
          ["Risco de churn por aluno", "atualizado toda manhã"],
          ["Ranking por unidade e por consultor", "para bater meta"],
          ["Exportação para o seu BI", "via CSV ou API"]
        ],
        screen: "dashboard",
        flip: true
      },
      {
        eyebrow: "Sua marca, sua margem",
        title: "Vende como serviço seu. A gente fica nos bastidores.",
        text:
          "Whitelabel completo: seu logo, suas cores, seu nome na loja. Você define o preço para o aluno e fica com a diferença — a cobrança pode ser sua ou nossa.",
        list: [
          ["App e e-mails com a sua identidade", "sem menção à Nutri&Live"],
          ["Você define o preço ao aluno", "e mantém a margem"],
          ["Material de venda pronto", "para a recepção e o Instagram"]
        ],
        screen: "whitelabel",
        flip: false
      }
    ],

    steps: [
      { title: "Conecte a sua base", text: "Integração com o seu sistema de gestão ou upload de CSV. Leva menos de uma hora." },
      { title: "Ative os alunos", text: "Convites em massa, QR na recepção e um roteiro pronto para a equipe comercial." },
      { title: "Acompanhe e retenha", text: "Painel de engajamento e alerta de risco de cancelamento, unidade por unidade." }
    ],

    features: [
      { icon: "building", title: "Multiunidade", text: "Uma conta, várias academias, com permissão e meta por unidade." },
      { icon: "users", title: "Papéis da equipe", text: "Recepção, consultor, professor e gestor — cada um vê só o que precisa." },
      { icon: "dumbbell", title: "Integra com o treino", text: "Gasto calórico do treino entra no cálculo do plano do aluno." },
      { icon: "gear", title: "API e webhooks", text: "Conecte ao seu CRM, BI ou sistema de cobrança sem retrabalho." },
      { icon: "headset", title: "Implantação assistida", text: "Um especialista acompanha o seu primeiro mês, do CSV ao primeiro relatório." },
      { icon: "receipt", title: "Faturamento único", text: "Uma nota fiscal por mês para a rede toda, com rateio por unidade." }
    ],

    plansNote: "Preço por unidade. Redes acima de 5 unidades têm condição negociada.",
    plans: [
      {
        name: "Studio",
        desc: "Estúdios e boxes até 150 alunos.",
        monthly: 24900, yearly: 19900,
        cta: "Contratar Studio", planKey: "studio",
        features: [
          "Até 150 alunos ativos",
          "1 unidade",
          "Painel de engajamento",
          "Convite em massa por link e QR",
          "Suporte por e-mail e WhatsApp"
        ],
        off: ["Marca própria (whitelabel)", "API e integrações"]
      },
      {
        name: "Academia",
        desc: "A operação completa de uma academia de bairro ou de rua.",
        monthly: 54900, yearly: 43900,
        featured: true, flag: "Mais contratado",
        cta: "Contratar Academia", planKey: "academia",
        features: [
          "Até 600 alunos ativos",
          "Até 3 unidades na mesma conta",
          "Tudo do Studio",
          "Marca própria no app, e-mail e PDF",
          "Integração com o sistema de gestão",
          "Alerta de risco de cancelamento",
          "Implantação assistida no primeiro mês"
        ]
      },
      {
        name: "Rede",
        desc: "Redes e franquias a partir de 4 unidades.",
        monthly: 119000, yearly: 95200,
        cta: "Falar com vendas", planKey: "rede",
        features: [
          "Alunos e unidades ilimitados",
          "Tudo do Academia",
          "API, webhooks e exportação para BI",
          "SSO e gestão centralizada de acessos",
          "SLA contratual e ambiente de homologação",
          "Gerente de conta e revisão trimestral",
          "Faturamento consolidado com rateio"
        ]
      }
    ],

    testimonials: [
      { text: "A gente vendia treino e ponto. Colocamos nutrição no plano premium e o ticket subiu R$ 49. Em quatro meses pagou o ano inteiro do sistema.", name: "Bruno Tavares", role: "Sócio · Corpo Vivo Academia, Belo Horizonte/MG", initials: "BT" },
      { text: "O alerta de risco é o que a gente mais usa. A recepção liga pro aluno antes de ele pensar em cancelar. Caiu bastante o churn de janeiro.", name: "Patrícia Lemos", role: "Gerente de rede · Rede Movimento, 9 unidades", initials: "PL" },
      { text: "Implantamos em 6 unidades numa semana. A integração com o Pacto puxou tudo e não precisei de TI.", name: "Eduardo Kimura", role: "Diretor de operações · Alta Performance, Santos/SP", initials: "EK" }
    ],

    faq: [
      { q: "Precisamos ter um nutricionista contratado?", a: "Não é obrigatório. Os planos gerados são material educativo, revisado pelo nosso time clínico. Se a sua unidade tiver nutricionista, ela ganha acesso ao painel profissional sem custo adicional e assume a prescrição." },
      { q: "Como é a cobrança de uma rede?", a: "Uma fatura só por mês para a rede inteira, com rateio por unidade no detalhamento. Aceitamos cartão de crédito corporativo, débito recorrente, Pix e boleto com 15 ou 30 dias, conforme o contrato." },
      { q: "Dá para revender com a nossa marca?", a: "Dá, a partir do plano Academia. O app, os e-mails e os PDFs saem com o seu logo e as suas cores. Você define o preço cobrado do aluno e fica com a diferença." },
      { q: "Com quais sistemas vocês integram?", a: "Tecnofit, Pacto, Evo, Next Fit e W12 têm integração pronta. Para os demais, importamos por CSV ou usamos a nossa API — e temos webhooks de ativação, cancelamento e frequência." },
      { q: "Quanto tempo leva a implantação?", a: "Uma unidade entra no ar em menos de um dia. Redes de até 10 unidades costumam levar de 5 a 7 dias, com um especialista nosso acompanhando cada etapa." },
      { q: "O que acontece se passarmos do limite de alunos?", a: "Avisamos em 80% do limite e você escolhe: sobe de faixa ou libera alunos inativos. Não bloqueamos acesso de aluno ativo sem falar com você antes." },
      { q: "Quem é o dono dos dados dos alunos?", a: "A academia é a controladora dos dados e nós somos operadores, nos termos da LGPD. Temos contrato de tratamento de dados (DPA), e você pode exportar ou solicitar a eliminação da base a qualquer momento." },
      { q: "Existe fidelidade?", a: "No mensal, não: cancela quando quiser com 30 dias de aviso. No anual, o desconto é de 20% e o contrato é de 12 meses — com cláusula de saída sem multa se a gente descumprir o SLA." }
    ],

    finalCta: {
      title: "Uma conversa de 20 minutos resolve.",
      text: "A gente monta a projeção de receita e de retenção com os números da sua unidade, sem compromisso.",
      primary: { label: "Falar com vendas", href: "checkout.html?seg=academia&plan=academia" },
      secondary: { label: "Baixar o material comercial", href: "#", noop: true }
    }
  }
};

export const order = ["voce", "nutri", "academia"];
