import { shell } from "./shell.mjs";
import { header } from "../components/header.mjs";
import { footer } from "../components/footer.mjs";
import {
  hero, logostrip, stats, steps, showcases, features,
  pricing, trust, testimonials, faq, crossSell, finalCta, stickyCta
} from "../components/sections.mjs";
import { site } from "../data/site.mjs";

const HEADS = {
  voce: {
    steps: { eyebrow: "Como funciona", title: "Três passos. Nenhum deles é uma planilha.", text: "Do primeiro toque ao seu plano pronto, em menos tempo do que leva pra pedir um delivery." },
    features: { eyebrow: "No app", title: "As coisas pequenas que fazem você continuar.", text: "Cada detalhe existe para tirar uma decisão do seu dia." },
    testimonials: { eyebrow: "Quem já usa", title: "Gente real, semana real, resultado real." },
    logos: { title: "Citado por", items: ["Exame", "Veja Saúde", "InfoMoney", "Startups", "GQ Brasil"] }
  },
  nutri: {
    steps: { eyebrow: "Como funciona", title: "Do primeiro paciente ao consultório inteiro.", text: "Migração numa tarde, primeiro plano em quatro minutos." },
    features: { eyebrow: "No painel", title: "O que um consultório precisa, sem seis assinaturas.", text: "Prontuário, prescrição, adesão e agenda no mesmo lugar." },
    testimonials: { eyebrow: "Quem já atende por aqui", title: "Nutricionistas que trocaram a planilha e não voltaram." },
    logos: { title: "Usado por profissionais formados em", items: ["USP", "UNIFESP", "UFRJ", "PUC-PR", "UFMG"] }
  },
  academia: {
    steps: { eyebrow: "Como funciona", title: "Da planilha de alunos ao primeiro relatório.", text: "Uma unidade entra no ar em menos de um dia." },
    features: { eyebrow: "Na operação", title: "Feito para quem gerencia unidade, não app.", text: "Controle, integração e relatório que o financeiro entende." },
    testimonials: { eyebrow: "Quem já opera assim", title: "Academias que pararam de perder aluno em janeiro." },
    logos: { title: "Integrado com", items: ["Tecnofit", "Pacto", "EVO", "Next Fit", "W12"] }
  }
};

const jsonLd = (c) =>
  JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: site.name,
        url: site.url,
        email: site.email,
        address: { "@type": "PostalAddress", streetAddress: site.endereco, addressCountry: "BR" }
      },
      {
        "@type": "Product",
        name: `${site.name} — ${c.navLabel}`,
        description: c.metaDesc,
        brand: { "@type": "Brand", name: site.name },
        offers: c.plans.map((p) => ({
          "@type": "Offer",
          name: p.name,
          price: (p.monthly / 100).toFixed(2),
          priceCurrency: "BRL",
          availability: "https://schema.org/InStock",
          url: `${site.url}/checkout.html?seg=${c.key}&plan=${p.planKey}`
        })),
        aggregateRating: { "@type": "AggregateRating", ratingValue: "4.9", reviewCount: "3184" }
      },
      {
        "@type": "FAQPage",
        mainEntity: c.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a }
        }))
      }
    ]
  });

export const landing = (c) => {
  const h = HEADS[c.key];
  const featured = c.plans.find((p) => p.featured) || c.plans[0];
  return shell({
    title: c.title,
    desc: c.metaDesc,
    canonical: c.slug === "index.html" ? "" : c.slug,
    jsonLd: jsonLd(c),
    body: `
${header({ current: c.key, cta: { label: "Assinar", href: `checkout.html?seg=${c.key}&plan=${featured.planKey}` } })}
<main id="conteudo">
  ${hero(c)}
  ${logostrip(h.logos)}
  ${stats(c.stats)}
  ${steps(c.steps, h.steps)}
  ${showcases(c.showcases)}
  ${features(c.features, h.features)}
  ${pricing(c)}
  ${testimonials(c.testimonials, h.testimonials)}
  ${trust()}
  ${faq(c.faq, c.key)}
  ${crossSell(c.key)}
  ${finalCta(c)}
</main>
${footer()}
${stickyCta(c)}`
  });
};
