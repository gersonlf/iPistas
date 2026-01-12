// ===== Config =====
const CAMINHO_PDF = "assets/SeasonSchedule.pdf";
const CHAVE_CACHE = "iracing_pdf_cache_v1"; // muda se alterar a lógica

// ===== Elementos =====
const entradaPista = document.getElementById("entradaPista");
const botaoSeta = document.getElementById("botaoSeta");
const listaDropdown = document.getElementById("listaDropdown");
const btnBuscar = document.getElementById("btnBuscar");
const btnRecarregar = document.getElementById("btnRecarregar");

const aguarde = document.getElementById("aguarde");
const aguardeSub = document.getElementById("aguardeSub");

const statusTexto = document.getElementById("statusTexto");
const bolinha = document.getElementById("bolinha");

const tituloResultado = document.getElementById("tituloResultado");
const miniInfo = document.getElementById("miniInfo");
const corpoTabela = document.getElementById("corpoTabela");

// ===== Estado =====
let pistas = [];                // lista de pistas (strings)
let dados = [];                 // registros extraídos do PDF (genérico)
let pistasFiltradas = [];
let indiceSelecionado = -1;

// ===== UI helpers =====
function setStatus(texto, cor) {
  statusTexto.textContent = texto;
  bolinha.style.background = cor || "#33d17a";
}

function mostrarAguarde(tituloSecundario) {
  aguardeSub.textContent = tituloSecundario || "Processando…";
  aguarde.hidden = false;
  entradaPista.disabled = true;
  botaoSeta.disabled = true;
  btnBuscar.disabled = true;
  btnRecarregar.disabled = true;
  setStatus("Aguarde…", "#ffcc00");
}

function esconderAguarde() {
  aguarde.hidden = true;
  entradaPista.disabled = false;
  botaoSeta.disabled = false;
  btnBuscar.disabled = false;
  btnRecarregar.disabled = false;
  setStatus("Pronto", "#33d17a");
}

function limparTabela(msg) {
  corpoTabela.innerHTML =
    `<tr><td colspan="4" class="vazio">${msg || "Sem dados."}</td></tr>`;
}

function normalizar(txt) {
  return (txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

// ===== Dropdown (sem roubar foco) =====
function abrirDropdown() {
  if (pistasFiltradas.length === 0) {
    listaDropdown.hidden = true;
    return;
  }
  listaDropdown.hidden = false;
}

function fecharDropdown() {
  listaDropdown.hidden = true;
  indiceSelecionado = -1;
  atualizarSelecaoVisual();
}

function atualizarSelecaoVisual() {
  const itens = listaDropdown.querySelectorAll(".item");
  itens.forEach((el, i) => {
    el.classList.toggle("sel", i === indiceSelecionado);
  });
}

function renderizarDropdown() {
  listaDropdown.innerHTML = "";

  pistasFiltradas.forEach((nome, i) => {
    const div = document.createElement("div");
    div.className = "item";
    div.textContent = nome;

    // NÃO vamos focar a lista. Clique só seleciona e devolve foco ao input.
    div.addEventListener("mousedown", (ev) => {
      // evita o browser trocar foco para a div
      ev.preventDefault();
    });

    div.addEventListener("click", () => {
      selecionarPista(nome);
      fecharDropdown();
      entradaPista.focus();
      entradaPista.setSelectionRange(entradaPista.value.length, entradaPista.value.length);
    });

    listaDropdown.appendChild(div);
  });

  indiceSelecionado = pistasFiltradas.length ? 0 : -1;
  atualizarSelecaoVisual();
}

function filtrarListaPistas() {
  const q = normalizar(entradaPista.value.trim());
  if (!q) {
    pistasFiltradas = [...pistas];
  } else {
    pistasFiltradas = pistas.filter(p => normalizar(p).includes(q));
  }
  renderizarDropdown();
  abrirDropdown();
}

function selecionarPista(nome) {
  entradaPista.value = nome;
  tituloResultado.textContent = nome;
}

// ===== PDF: cache =====
async function sha256Hex(arrayBuffer) {
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const bytes = new Uint8Array(hashBuffer);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function carregarCache() {
  try {
    const bruto = localStorage.getItem(CHAVE_CACHE);
    if (!bruto) return null;
    return JSON.parse(bruto);
  } catch {
    return null;
  }
}

function salvarCache(obj) {
  try {
    localStorage.setItem(CHAVE_CACHE, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

// ===== PDF: leitura e extração =====
async function extrairTextoPDF(arrayBuffer) {
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const paginas = pdf.numPages;
  let tudo = "";

  for (let p = 1; p <= paginas; p++) {
    mostrarAguarde(`Lendo PDF… página ${p}/${paginas}`);
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();

    // junta pedaços com espaços
    const texto = content.items.map(it => it.str).join(" ");
    tudo += "\n" + texto;
  }

  return tudo;
}

/**
 * Parser “genérico”:
 * - tenta achar padrões comuns de tabela/linhas
 * - e também tenta extrair uma lista de pistas pelo texto.
 *
 * Como PDFs variam MUITO, eu deixei a função bem fácil de ajustar:
 * mexer nas regex dentro dela.
 */
function parsearSchedule(textoBruto) {
  const texto = textoBruto.replace(/\s+/g, " ").trim();

  // 1) Extrair pistas: heurística simples
  //    - pega “Track”, “Circuit”, etc se aparecer
  //    - senão, tenta achar nomes repetidos e “bonitos”
  const achadas = new Set();

  // Padrões comuns (ajuste se seu PDF tiver outro)
  const padroesPista = [
    /(?:Track|Circuit|Pista)\s*[:\-]\s*([A-Za-zÀ-ÿ0-9'’().,\- ]{4,60})/g,
  ];

  for (const re of padroesPista) {
    let m;
    while ((m = re.exec(texto)) !== null) {
      const nome = m[1].trim();
      if (nome.length >= 4) achadas.add(nome);
    }
  }

  // Fallback: pega “frases” com letras que parecem nomes próprios (bem leve)
  // (isso pode trazer lixo em alguns PDFs; se acontecer, removemos depois)
  if (achadas.size < 5) {
    const reNome = /\b([A-ZÀ-Ý][A-Za-zÀ-ÿ'’().,\- ]{3,50})\b/g;
    let m;
    while ((m = reNome.exec(texto)) !== null) {
      const nome = m[1].trim();
      if (nome.length > 6 && !/^(Week|Season|Round|Race|Date|Series)\b/i.test(nome)) {
        achadas.add(nome);
      }
      if (achadas.size > 250) break;
    }
  }

  // 2) “Dados” (tabela):
  // Sem saber o layout exato do seu PDF, eu guardo o texto bruto,
  // e o filtro por pista vai buscar no texto das linhas.
  // Se você quiser “colunas perfeitas”, ajustamos com 1 regex do seu PDF.
  const linhas = textoBruto.split("\n").map(l => l.trim()).filter(Boolean);

  return {
    pistas: [...achadas].sort((a,b)=>a.localeCompare(b)),
    linhas
  };
}

function montarTabelaPorPista(nomePista) {
  const q = normalizar(nomePista);
  if (!q) {
    limparTabela("Selecione uma pista.");
    return;
  }

  // filtra linhas do texto que contenham a pista
  const linhas = dados.filter(l => normalizar(l).includes(q));

  miniInfo.textContent = `${linhas.length} linhas encontradas no PDF contendo a pista.`;

  if (linhas.length === 0) {
    limparTabela("Nada encontrado para essa pista (pelo texto do PDF).");
    return;
  }

  // Render simples: tenta quebrar em campos “semana/data/serie/detalhes”
  // (sem saber o layout, fica no modo “robusto”)
  corpoTabela.innerHTML = "";
  for (const linha of linhas.slice(0, 300)) {
    const tr = document.createElement("tr");

    // heurística bem simples:
    const semana = (linha.match(/\b(Week|Semana)\s*\d+\b/i) || [""])[0];
    const data = (linha.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/) || [""])[0];
    const serie = ""; // (se seu PDF tiver padrão, dá pra extrair)
    const detalhes = linha;

    tr.innerHTML = `
      <td>${semana || "-"}</td>
      <td>${data || "-"}</td>
      <td>${serie || "-"}</td>
      <td>${detalhes}</td>
    `;
    corpoTabela.appendChild(tr);
  }
}

// ===== Carregar tudo =====
async function carregarPDF(ignorarCache = false) {
  mostrarAguarde("Baixando o PDF do projeto…");

  const resp = await fetch(CAMINHO_PDF, { cache: "no-store" });
  if (!resp.ok) throw new Error("Não consegui abrir o PDF em " + CAMINHO_PDF);

  const arrayBuffer = await resp.arrayBuffer();
  const hash = await sha256Hex(arrayBuffer);

  if (!ignorarCache) {
    const cache = carregarCache();
    if (cache && cache.hash === hash && cache.pistas && cache.linhas) {
      pistas = cache.pistas;
      dados = cache.linhas;
      return { usouCache: true };
    }
  }

  // Processa de verdade
  const texto = await extrairTextoPDF(arrayBuffer);
  mostrarAguarde("Interpretando conteúdo…");

  const parsed = parsearSchedule(texto);
  pistas = parsed.pistas;
  dados = parsed.linhas;

  salvarCache({ hash, pistas, linhas: dados });
  return { usouCache: false };
}

function prepararUIDepoisDeCarregar(usouCache) {
  esconderAguarde();

  if (!pistas || pistas.length === 0) {
    setStatus("PDF carregado, mas não consegui listar pistas automaticamente.", "#ffcc00");
    entradaPista.placeholder = "Digite (a lista pode estar vazia)";
    pistas = [];
  } else {
    setStatus(usouCache ? "Pronto (cache)" : "Pronto", "#33d17a");
  }

  pistasFiltradas = [...pistas];
  renderizarDropdown();
  fecharDropdown();
  limparTabela("Selecione uma pista e clique em Buscar.");
}

// ===== Eventos =====
entradaPista.addEventListener("input", () => {
  // mantém foco no input e só atualiza a lista
  filtrarListaPistas();
});

entradaPista.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    if (!listaDropdown.hidden) {
      fecharDropdown();
      ev.preventDefault();
      return;
    }
    entradaPista.value = "";
    filtrarListaPistas();
    ev.preventDefault();
    return;
  }

  if (ev.key === "ArrowDown") {
    if (listaDropdown.hidden) abrirDropdown();
    else {
      indiceSelecionado = Math.min(indiceSelecionado + 1, pistasFiltradas.length - 1);
      atualizarSelecaoVisual();
      // não scroll automático agressivo, mas ajuda:
      const el = listaDropdown.querySelectorAll(".item")[indiceSelecionado];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
    ev.preventDefault();
    return;
  }

  if (ev.key === "ArrowUp") {
    if (!listaDropdown.hidden) {
      indiceSelecionado = Math.max(indiceSelecionado - 1, 0);
      atualizarSelecaoVisual();
      const el = listaDropdown.querySelectorAll(".item")[indiceSelecionado];
      if (el) el.scrollIntoView({ block: "nearest" });
      ev.preventDefault();
    }
    return;
  }

  if (ev.key === "Enter") {
    if (!listaDropdown.hidden && indiceSelecionado >= 0 && pistasFiltradas[indiceSelecionado]) {
      selecionarPista(pistasFiltradas[indiceSelecionado]);
      fecharDropdown();
      ev.preventDefault();
    }
  }
});

botaoSeta.addEventListener("click", () => {
  if (listaDropdown.hidden) {
    filtrarListaPistas();
    abrirDropdown();
  } else {
    fecharDropdown();
  }
  entradaPista.focus();
});

btnBuscar.addEventListener("click", () => {
  const nome = entradaPista.value.trim();
  if (!nome) {
    limparTabela("Digite/seleciona uma pista primeiro.");
    return;
  }
  setStatus("Filtrando…", "#ffcc00");
  tituloResultado.textContent = nome;
  montarTabelaPorPista(nome);
  setStatus("Pronto", "#33d17a");
});

btnRecarregar.addEventListener("click", async () => {
  try {
    const r = await carregarPDF(true);
    prepararUIDepoisDeCarregar(r.usouCache);
  } catch (e) {
    esconderAguarde();
    setStatus("Erro ao carregar PDF", "#ffcc00");
    alert(String(e));
  }
});

// Fecha dropdown ao clicar fora (sem roubar foco ao digitar)
document.addEventListener("mousedown", (ev) => {
  const dentro =
    ev.target === entradaPista ||
    ev.target === botaoSeta ||
    listaDropdown.contains(ev.target);
  if (!dentro) fecharDropdown();
});

// ===== Boot =====
(async function iniciar() {
  try {
    const r = await carregarPDF(false);
    prepararUIDepoisDeCarregar(r.usouCache);
  } catch (e) {
    esconderAguarde();
    setStatus("Erro ao abrir PDF", "#ffcc00");
    alert(
      "Não consegui abrir o PDF.\n\n" +
      "Confirme se existe: " + CAMINHO_PDF + "\n\n" +
      "Detalhe: " + String(e)
    );
  }
})();
