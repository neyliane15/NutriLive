#!/usr/bin/env python3
"""
Extrai as tabelas oficiais para JSON, a partir das planilhas ORIGINAIS.

  TACO 4ª edição (NEPA/UNICAMP, 2011) — composição por 100 g de parte comestível
  POF 2008-2009 (IBGE) — Tabela de Medidas Referidas, em gramas

As planilhas não são redistribuídas aqui: veja docs/TABELAS.md para onde
baixá-las. Este script lê o .xls original, não um CSV de terceiro — a conta
do produto tem de sair da fonte.
"""
import json, sys, unicodedata, re
from pathlib import Path
import xlrd

RAIZ = Path(sys.argv[1] if len(sys.argv) > 1 else ".")
SAIDA = Path(sys.argv[2] if len(sys.argv) > 2 else "server/ai/dados")
SAIDA.mkdir(parents=True, exist_ok=True)

def num(v):
    """Célula numérica da TACO. 'Tr' (traço) e 'NA' viram None, não zero:
    zero afirma ausência, e a tabela não afirma isso."""
    if v is None: return None
    t = str(v).strip()
    if t in ("", "NA", "Tr", "*", "-"): return None
    try: return float(t)
    except ValueError: return None

# ----------------------------------------------------------------- TACO
wb = xlrd.open_workbook(RAIZ / "data/raw/taco/Taco_4a_edicao_2011.xls")
sh = wb.sheet_by_index(0)
COL = {
    "umidade": 2, "kcal": 3, "kj": 4, "proteina": 5, "lipideos": 6, "colesterol": 7,
    "carboidrato": 8, "fibra": 9, "cinzas": 10, "calcio": 11, "magnesio": 12,
    "manganes": 13, "fosforo": 14, "ferro": 15, "sodio": 16, "potassio": 17,
    "cobre": 18, "zinco": 19, "retinol": 20, "RE": 21, "RAE": 22, "tiamina": 23,
    "riboflavina": 24, "piridoxina": 25, "niacina": 26, "vitamina_c": 27,
}
alimentos, categoria = [], None
for r in range(3, sh.nrows):
    a = str(sh.cell_value(r, 0)).strip()
    d = str(sh.cell_value(r, 1)).strip()
    if a and not d:                      # linha de categoria
        categoria = a
        continue
    if not a or not d: continue
    try: numero = int(float(a))
    except ValueError: continue
    item = {"numero": numero, "descricao": d, "categoria": categoria}
    for nome, c in COL.items():
        item[nome] = num(sh.cell_value(r, c))
    alimentos.append(item)

print(f"TACO: {len(alimentos)} alimentos em {len({a['categoria'] for a in alimentos})} categorias")

# ----------------------------------------------------------------- POF
wb2 = xlrd.open_workbook(RAIZ / "data/raw/pof/tabelamedidas_bd.xls")
sh2 = wb2.sheet_by_name("Tab_Medidas Caseiras")
medidas = []
for r in range(5, sh2.nrows):
    cod = str(sh2.cell_value(r, 0)).strip()
    desc = str(sh2.cell_value(r, 1)).strip()
    if not cod or not desc: continue
    g = num(sh2.cell_value(r, 8))
    if g is None or g <= 0: continue
    medidas.append({
        "codigo": int(float(cod)),
        "alimento": desc,
        "preparacao": str(sh2.cell_value(r, 3)).strip(),
        "medida": str(sh2.cell_value(r, 5)).strip(),
        "gramas": round(g, 2),
    })
print(f"POF: {len(medidas)} medidas caseiras de {len({m['codigo'] for m in medidas})} alimentos")

(SAIDA / "taco-4a-edicao.json").write_text(
    json.dumps({"fonte": "TACO — Tabela Brasileira de Composição de Alimentos, 4ª edição revisada e ampliada. NEPA/UNICAMP, Campinas, 2011.",
                "unidade": "por 100 g de parte comestível",
                "alimentos": alimentos}, ensure_ascii=False, indent=1), encoding="utf-8")
(SAIDA / "pof-medidas-caseiras.json").write_text(
    json.dumps({"fonte": "Tabela de Medidas Referidas para os Alimentos Consumidos no Brasil. POF 2008-2009, IBGE, Rio de Janeiro, 2011.",
                "medidas": medidas}, ensure_ascii=False, indent=1), encoding="utf-8")
print("gravado em", SAIDA)
