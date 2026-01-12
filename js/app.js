// iPista (Web) - GitHub Pages
// Agora o site NÃO processa o PDF no navegador (o PDF tem 170 páginas e pode ficar lento/“travado” em alguns browsers).
// Em vez disso, ele lê um índice pronto em: data/index.json (gerado a partir do SeasonSchedule.pdf).
//
// Quando você atualizar o PDF, rode o script build_index.py (incluso no ZIP) e suba de novo.

const INDEX_PATH = "data/index.json";
const BUILD_VERSION = "20260112_0145";

const CATEGORIAS = ["OVAL", "SPORTS CAR", "FORMULA CAR", "DIRT OVAL", "DIRT ROAD", "UNRANKED"];
const CLASSES = ["R","D","C","B","A"];

const elDot = document.getElementById("dot");
const elStatus = document.getElementById("statusTxt");
const elLoading = document.getElementById("loading");
const elLoadingSub = document.getElementById("loadingSub");
const elCacheInfo = document.getElementById("cacheInfo");

const trackInput = document.getElementById("trackInput");
const seriesFilter = document.getElementById("seriesFilter");
const carsFilter = document.getElementById("carsFilter");
const sortSelect = document.getElementById("sortSelect");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");

const dropdown = document.getElementById("dropdown");
const btnToggleDrop = document.getElementById("toggleDrop");

const catsWrap = document.getElementById("cats");
const classesWrap = document.getElementById("classes");

const resultTitle = document.getElementById("resultTitle");
const resultSub = document.getElementById("resultSub");
const tbody = document.getElementById("tbody");

let dados = [];
let pistas = [];
let pistasFiltradas = [];
let selIndex = -1;

function setStatus(txt, color){
  elStatus.textContent = txt;
  elDot.style.background = color || "#33d17a";
}

function showLoading(txt){
  elLoadingSub.textContent = txt || "Carregando…";
  elLoading.hidden = false;
  trackInput.disabled = true;
  seriesFilter.disabled = true;
  if (carsFilter) carsFilter.disabled = true;
  if (sortSelect) sortSelect.disabled = true;
  btnSearch.disabled = true;
  btnClear.disabled = true;
  btnToggleDrop.disabled = true;
  setStatus("Aguarde…", "#ffcc00");
}

function hideLoading(){
  elLoading.hidden = true;
  trackInput.disabled = false;
  seriesFilter.disabled = false;
  if (carsFilter) carsFilter.disabled = false;
  if (sortSelect) sortSelect.disabled = false;
  btnSearch.disabled = false;
  btnClear.disabled = false;
  btnToggleDrop.disabled = false;
  setStatus("Pronto", "#33d17a");
}

function escHTML(s){
  return (s ?? "").toString()
    .replace(/&/g,"&amp;")
    .replace(/</g,"&lt;")
    .replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

function norm(s){
  return (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function mkChk(container, idPrefix, label, checked=true){
  const id = `${idPrefix}_${label.replace(/\s+/g,"_")}`;
  const wrap = document.createElement("label");
  wrap.className = "chk";
  const inp = document.createElement("input");
  inp.type = "checkbox";
  inp.id = id;
  inp.checked = checked;
  inp.dataset.value = label;
  const sp = document.createElement("span");
  sp.textContent = label;
  wrap.appendChild(inp);
  wrap.appendChild(sp);
  container.appendChild(wrap);
  return inp;
}

const catChecks = CATEGORIAS.map(c => mkChk(catsWrap, "cat", c, true));
const classChecks = CLASSES.map(c => mkChk(classesWrap, "cls", c, true));

function getSelectedValues(checks){
  const set = new Set();
  for (const c of checks){
    if (c.checked) set.add(c.dataset.value);
  }
  return set;
}

// ===== Dropdown sem roubar foco =====
function renderDropdown(){
  dropdown.innerHTML = "";
  for (let i=0; i<pistasFiltradas.length; i++){
    const nome = pistasFiltradas[i];
    const div = document.createElement("div");
    div.className = "item";
    div.textContent = nome;

    div.addEventListener("mousedown", (ev) => ev.preventDefault());
    div.addEventListener("click", () => {
      selectTrack(nome);
      closeDropdown();
      keepFocusAtEnd();
    });

    dropdown.appendChild(div);
  }
  selIndex = pistasFiltradas.length ? 0 : -1;
  updateSel();
}

function updateSel(){
  const items = dropdown.querySelectorAll(".item");
  items.forEach((el, idx) => el.classList.toggle("sel", idx === selIndex));
}

function openDropdown(){
  dropdown.hidden = !pistasFiltradas.length;
}
function closeDropdown(){
  dropdown.hidden = true;
  selIndex = -1;
  updateSel();
}
function keepFocusAtEnd(){
  trackInput.focus();
  const n = trackInput.value.length;
  trackInput.setSelectionRange(n, n);
}

function filterTracks(){
  const q = norm(trackInput.value);
  if (!q) pistasFiltradas = pistas.slice();
  else pistasFiltradas = pistas.filter(p => norm(p).includes(q));
  renderDropdown();
  openDropdown();
}

function selectTrack(nome){
  trackInput.value = nome;
  resultTitle.textContent = `Pista: ${nome}`;
}

btnToggleDrop.addEventListener("click", () => {
  if (dropdown.hidden) filterTracks();
  else closeDropdown();
  keepFocusAtEnd();
});

trackInput.addEventListener("input", () => filterTracks());

trackInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape"){
    if (!dropdown.hidden){ closeDropdown(); ev.preventDefault(); return; }
    trackInput.value = "";
    filterTracks();
    ev.preventDefault();
    return;
  }
  if (ev.key === "ArrowDown"){
    if (dropdown.hidden){
      openDropdown();
    } else {
      selIndex = Math.min(selIndex + 1, pistasFiltradas.length - 1);
      updateSel();
      const el = dropdown.querySelectorAll(".item")[selIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
    ev.preventDefault();
    return;
  }
  if (ev.key === "ArrowUp"){
    if (!dropdown.hidden){
      selIndex = Math.max(selIndex - 1, 0);
      updateSel();
      const el = dropdown.querySelectorAll(".item")[selIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
      ev.preventDefault();
    }
    return;
  }
  if (ev.key === "Enter"){
    // Se o dropdown está aberto, Enter seleciona o item destacado.
    if (!dropdown.hidden && selIndex >= 0 && pistasFiltradas[selIndex]){
      selectTrack(pistasFiltradas[selIndex]);
      closeDropdown();
      ev.preventDefault();
      // Após selecionar, já dispara a busca
      btnSearch.click();
      return;
    }
    // Se o dropdown está fechado, Enter já executa Buscar direto
    if (dropdown.hidden){
      ev.preventDefault();
      btnSearch.click();
      return;
    }
  }
});

document.addEventListener("mousedown", (ev) => {
  const inside = ev.target === trackInput || ev.target === btnToggleDrop || dropdown.contains(ev.target);
  if (!inside) closeDropdown();
});

// ===== Tabela =====
function renderTable(rows){
  tbody.innerHTML = "";
  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="6" class="empty">Nada encontrado.</td></tr>`;
    return;
  }
  for (const d of rows){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escHTML(d.inicio_semana || "")}</td>
      <td style="text-align:center">${escHTML(d.week ?? "")}</td>
      <td>${escHTML(d.categoria || "")}</td>
      <td style="text-align:center">${escHTML(d.classe || "")}</td>
      <td>${escHTML(d.serie || "")}</td>
      <td>${escHTML(d.pista || "")}</td>
      <td>${escHTML(d.carros || "")}</td>
    `;
    tbody.appendChild(tr);
  }
}

function applyFilters(){
  const pistaSel = trackInput.value.trim();
  resultTitle.textContent = pistaSel ? `Pista: ${pistaSel}` : "Pista: (nenhuma)";

  const fSerie = norm(seriesFilter.value);
  const fCarros = carsFilter ? norm(carsFilter.value) : "";
  const catsOk = getSelectedValues(catChecks);
  const clsOk = getSelectedValues(classChecks);

  const rows = dados.filter(d => {
    if (catsOk.size && !catsOk.has(d.categoria)) return false;
    if (clsOk.size && !clsOk.has(d.classe)) return false;

    if (pistaSel){
      if (!norm(d.pista).includes(norm(pistaSel))) return false;
    }
    if (fSerie){
      if (!norm(d.serie).includes(fSerie)) return false;
    }
    if (fCarros){
      if (!norm(d.carros).includes(fCarros)) return false;
    }
    return true;
  });

  // Ordenação
  const ord = sortSelect ? sortSelect.value : "date";
  if (ord === "week_asc"){
    rows.sort((a,b) => (a.week - b.week) || (a.inicio_semana || "").localeCompare(b.inicio_semana || "") || (a.serie || "").localeCompare(b.serie || ""));
  } else if (ord === "week_desc"){
    rows.sort((a,b) => (b.week - a.week) || (a.inicio_semana || "").localeCompare(b.inicio_semana || "") || (a.serie || "").localeCompare(b.serie || ""));
  } else {
    // padrão: por data -> week -> série
    rows.sort((a,b) => (a.inicio_semana || "").localeCompare(b.inicio_semana || "") || (a.week - b.week) || (a.serie || "").localeCompare(b.serie || ""));
  }
  renderTable(rows);

  resultSub.textContent = `Resultados: ${rows.length} (de ${dados.length})`;
}

btnSearch.addEventListener("click", () => {
  setStatus("Filtrando…", "#ffcc00");
  applyFilters();
  setStatus("Pronto", "#33d17a");
});

btnClear.addEventListener("click", () => {
  trackInput.value = "";
  seriesFilter.value = "";
  if (carsFilter) carsFilter.value = "";
  if (sortSelect) sortSelect.value = "date";
  catChecks.forEach(c => c.checked = true);
  classChecks.forEach(c => c.checked = true);
  closeDropdown();
  filterTracks();
  applyFilters();
  keepFocusAtEnd();
});

[catsWrap, classesWrap].forEach(el => el.addEventListener("change", () => applyFilters()));
seriesFilter.addEventListener("input", () => applyFilters());
if (carsFilter) carsFilter.addEventListener("input", () => applyFilters());
if (sortSelect) sortSelect.addEventListener("change", () => applyFilters());

const INDEX_CACHE_KEY = "ipista_index_cache_v1";

function loadIndexCache(){
  try{
    const raw = localStorage.getItem(INDEX_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch(_){
    return null;
  }
}

function saveIndexCache(obj){
  try{
    localStorage.setItem(INDEX_CACHE_KEY, JSON.stringify(obj));
  }catch(_){}
}

// Evita mostrar "Aguarde..." se carregar rápido.
// Só mostra o painel se demorar mais que ~350ms.
let _loadingTimer = null;
function showLoadingDeferred(msg){
  if (_loadingTimer) clearTimeout(_loadingTimer);
  _loadingTimer = setTimeout(() => showLoading(msg), 350);
}
function hideLoadingSafe(){
  if (_loadingTimer) clearTimeout(_loadingTimer);
  _loadingTimer = null;
  hideLoading();
}

function initFromIndex(idx, origem){
  dados = idx.records || [];
  pistas = idx.tracks || [];

  pistasFiltradas = pistas.slice();
  renderDropdown();
  closeDropdown();

  setStatus("Pronto", "#33d17a");
  elCacheInfo.textContent = `Índice: ok • Registros: ${dados.length} • Pistas: ${pistas.length}` + (origem ? ` • ${origem}` : "");
  applyFilters();
}

async function boot(){
  try{
    // 1) tenta carregar do cache imediatamente (sem "Aguarde...")
    const cache = loadIndexCache();
    if (cache && Array.isArray(cache.records) && Array.isArray(cache.tracks)){
      initFromIndex(cache, "cache");
      // faz refresh em background (sem travar a UI)
      setStatus("Atualizando…", "#ffcc00");
      fetch(`${INDEX_PATH}?v=${BUILD_VERSION}`, { cache: "no-store" })
        .then(r => { if(!r.ok) throw new Error("Falha ao atualizar índice"); return r.json(); })
        .then(idx => {
          // só atualiza se mudou o hash (ou tamanho)
          const mudou = (idx.pdf_sha256 && idx.pdf_sha256 !== cache.pdf_sha256) || ((idx.records||[]).length !== (cache.records||[]).length);
          if (mudou){
            saveIndexCache(idx);
            initFromIndex(idx, "atualizado");
          } else {
            setStatus("Pronto", "#33d17a");
          }
        })
        .catch(_ => setStatus("Pronto", "#33d17a"));
      return;
    }

    // 2) primeira vez: carrega do arquivo (pode mostrar "Aguarde..." só se demorar)
    showLoadingDeferred("Carregando índice (data/index.json)…");

    const resp = await fetch(`${INDEX_PATH}?v=${BUILD_VERSION}`, { cache: "no-store" });
    if (!resp.ok) throw new Error(`Não consegui abrir: ${INDEX_PATH}`);
    const idx = await resp.json();

    saveIndexCache(idx);
    hideLoadingSafe();
    initFromIndex(idx, "primeira vez");
  }catch(e){
    hideLoadingSafe();
    setStatus("Erro", "#ffcc00");
    tbody.innerHTML = `<tr><td colspan="6" class="empty">Erro ao carregar índice. Veja o console.</td></tr>`;
    console.error(e);
    alert(String(e));
  }
}

boot();
