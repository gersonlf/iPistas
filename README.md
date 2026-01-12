# iPista (Web) – GitHub Pages (offline)

Este projeto é um viewer/consulta offline do **SeasonSchedule.pdf** (iRacing), rodando em **GitHub Pages** sem precisar baixar executável.

## Como funciona
- O site lê o PDF em `assets/SeasonSchedule.pdf` usando **PDF.js**.
- Na primeira abertura, ele **processa** o PDF e cria um índice (pistas + registros).
- Depois ele salva um **cache** em `localStorage`, e abre bem mais rápido.

## Estrutura
```
/
  index.html
  css/style.css
  js/app.js
  assets/SeasonSchedule.pdf
```

## Publicar no GitHub Pages
1. Suba esses arquivos no seu repositório (branch `main`).
2. Vá em **Settings → Pages**.
3. Selecione:
   - **Deploy from a branch**
   - Branch: `main`
   - Folder: `/ (root)`
4. Acesse a URL que o GitHub vai mostrar.

## Atualizando o PDF
Basta substituir o arquivo em `assets/SeasonSchedule.pdf` e subir commit.
O site detecta mudança (SHA-256) e recria o cache automaticamente.

## Observações
O parser procura linhas no formato:
- `Week N (YYYY-MM-DD) <pista>` (às vezes a pista quebra em 2 linhas, ex.: termina com `-` e a próxima linha contém `Oval`)
- títulos de séries contendo `20xx Season`
- grupos: `R/D/C/B/A Class Series (...)`
