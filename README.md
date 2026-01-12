# iPista (Web) – GitHub Pages

✅ **Sem executável**: roda como site no GitHub Pages.  
✅ Usa sempre o mesmo PDF do repositório: `assets/SeasonSchedule.pdf`.

## Por que não ler o PDF no navegador?
O SeasonSchedule tem muitas páginas (ex.: 170). Em alguns browsers o PDF.js pode ficar lento/travar (principalmente se o worker falhar).
Por isso este projeto usa um **índice pronto** em `data/index.json`.

## Como publicar
1. Suba estes arquivos no seu repositório (branch `main`).
2. Settings → Pages → Deploy from a branch → `main` + `/ (root)`.

## Atualizar o PDF
1. Substitua `assets/SeasonSchedule.pdf`
2. Rode localmente:
```bash
pip install pymupdf
python build_index.py
```
3. Faça commit de `assets/SeasonSchedule.pdf` e `data/index.json`.

## Estrutura
```
/
  index.html
  css/style.css
  js/app.js
  data/index.json
  assets/SeasonSchedule.pdf
  build_index.py
```
