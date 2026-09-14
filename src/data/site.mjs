/* =========================================================================
   Nutri&Live — global site data (single source of truth for shared copy)
   ========================================================================= */

export const site = {
  name: "Nutri&Live",
  tagline: "Sua saúde, seu melhor plano.",
  domain: "nutrielive.com.br",
  url: "https://nutrielive.com.br",
  cnpj: "58.412.907/0001-24",
  razaoSocial: "Nutri&Live Tecnologia em Saúde Ltda.",
  endereco: "Av. Paulista, 1374 — 11º andar, Bela Vista, São Paulo/SP, 01310-100",
  email: "oi@nutrielive.com.br",
  whatsapp: "+55 11 4000-1234",
  whatsappHref: "https://wa.me/5511400012340",
  themeColor: "#17603D"
};

export const segments = {
  voce: {
    key: "voce",
    slug: "index.html",
    navLabel: "Para você",
    shortLabel: "Você",
    audience: "pessoa física"
  },
  nutri: {
    key: "nutri",
    slug: "nutricionistas.html",
    navLabel: "Para nutricionistas",
    shortLabel: "Nutricionistas",
    audience: "nutricionista"
  },
  academia: {
    key: "academia",
    slug: "academias.html",
    navLabel: "Para academias",
    shortLabel: "Academias",
    audience: "academia"
  }
};

export const nav = [
  { label: "Para você", href: "index.html", key: "voce", sub: "Plano alimentar, receitas e evolução" },
  { label: "Para nutricionistas", href: "nutricionistas.html", key: "nutri", sub: "Prontuário, planos e adesão em tempo real" },
  { label: "Para academias", href: "academias.html", key: "academia", sub: "Programa de parceria por comissão" },
  { label: "Preços", href: "#planos", key: "precos", sub: "Mensal, sem fidelidade" },
  { label: "Segurança", href: "seguranca.html", key: "seguranca", sub: "Como protegemos seus dados" }
];

export const footer = {
  columns: [
    {
      title: "Produto",
      links: [
        { label: "Para você", href: "index.html" },
        { label: "Para nutricionistas", href: "nutricionistas.html" },
        { label: "Para academias", href: "academias.html" },
        { label: "Preços", href: "index.html#planos" },
        { label: "Novidades", href: "#" }
      ]
    },
    {
      title: "Confiança",
      links: [
        { label: "Segurança e privacidade", href: "seguranca.html" },
        { label: "Termos de uso", href: "termos.html" },
        { label: "Política de privacidade", href: "privacidade.html" },
        { label: "Status do sistema", href: "#" },
        { label: "Portal do titular (LGPD)", href: "privacidade.html#titular" }
      ]
    },
    {
      title: "Ajuda",
      links: [
        { label: "Central de ajuda", href: "#" },
        { label: "Falar com a gente", href: "#" },
        { label: "Cancelar assinatura", href: "termos.html#cancelamento" },
        { label: "Reembolso em 30 dias", href: "termos.html#reembolso" },
        { label: "WhatsApp", href: site.whatsappHref }
      ]
    }
  ],
  legal: [
    `${site.razaoSocial} — CNPJ ${site.cnpj}. ${site.endereco}.`,
    "O Nutri&Live é uma ferramenta de organização e educação alimentar. Não substitui consulta, diagnóstico ou prescrição de profissional de saúde. Planos gerados no app são sugestões educativas e devem ser validados por um nutricionista habilitado.",
    "Pagamentos processados por instituição parceira certificada PCI-DSS nível 1. Nutri&Live não armazena o número completo do seu cartão."
  ]
};

/* ---------- Payment / trust facts reused across pages ---------- */
export const trustFacts = {
  guarantees: [
    { icon: "phone", text: "Cancele em 2 toques no app. Sem multa, sem ligação." },
    { icon: "lock", text: "Pagamento criptografado. Não guardamos seu cartão." },
    { icon: "calendar", text: "Cobrança mensal. Sem contrato de permanência." },
    { icon: "globe", text: "Dados no Brasil, com criptografia e conformidade com a LGPD." }
  ],
  methods: [
    { key: "credito", label: "Cartão de crédito", sub: "Renova sozinho todo mês", icon: "card" },
    { key: "debito", label: "Cartão de débito", sub: "Débito recorrente autorizado", icon: "cardDebit" },
    { key: "pix", label: "Pix", sub: "Aprovação na hora", icon: "pix", badge: "Sem taxa" }
  ]
};

/* ---------- Shared security pillars ---------- */
export const securityPillars = [
  {
    icon: "lock",
    title: "Criptografia de ponta a ponta",
    text: "Tudo que trafega entre você e a gente usa TLS 1.3. Seus dados de saúde ficam criptografados em repouso com AES-256."
  },
  {
    icon: "card",
    title: "Seu cartão nunca passa por aqui",
    text: "Os dados do cartão vão direto para o nosso parceiro de pagamentos, certificado PCI-DSS nível 1. Guardamos só os 4 últimos dígitos."
  },
  {
    icon: "shield",
    title: "LGPD desde a primeira linha",
    text: "Você decide o que compartilhar, com quem e por quanto tempo. Exporte ou apague tudo quando quiser, direto no app."
  },
  {
    icon: "eyeOff",
    title: "Nunca vendemos seus dados",
    text: "Sem anúncios, sem revenda, sem parceiro curioso. Nosso negócio é a assinatura — e é assim que fica."
  }
];
