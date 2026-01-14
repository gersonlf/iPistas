// iPista (Web) - GitHub Pages
// Agora o site NÃO processa o PDF no navegador (o PDF tem 170 páginas e pode ficar lento/“travado” em alguns browsers).
// Em vez disso, ele lê um índice pronto em: data/index.json (gerado a partir do SeasonSchedule.pdf).
//
// Quando você atualizar o PDF, rode o script build_index.py (incluso no ZIP) e suba de novo.

const INDEX_PATH = "data/index.json";
const BUILD_VERSION = "20260112_0905";
const CACHE_SCHEMA_VERSION = 2;

const CATEGORIAS = ["OVAL", "SPORTS CAR", "FORMULA CAR", "DIRT OVAL", "DIRT ROAD", "UNRANKED"];
const CLASSES = ["R","D","C","B","A"];

const elDot = document.getElementById("dot");
const elStatus = document.getElementById("statusTxt");
const elLoading = document.getElementById("loading");
const elLoadingSub = document.getElementById("loadingSub");
const elCacheInfo = document.getElementById("cacheInfo");
let tooltipEl = null;
let tooltipHideTimer = null;
const elVerInline = document.getElementById("verInline");

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

function pad2(n){ return String(n).padStart(2,"0"); }

function parseScheduleRaw(raw){
  // Retorna {tipo, textoPT, listaTimes:[...], original}
  // Tipos suportados:
  // - every_hours (intervalHours, minute)
  // - every_hour (minute)
  // - every_minutes_offsets (intervalMinutes, offsets[])
  // - fixed_gmt (items: [{dow:0-6, hour, min}])
  const s = (raw || "").trim();
  if (!s) return null;

  // every X hours at :MM past
  let m = s.match(/^Races\s+every\s+(\d+)\s+hours?\s+at\s*:?\s*(\d{1,2})\s+past\s*$/i);
  if (m){
    const interval = parseInt(m[1],10);
    const minute = parseInt(m[2],10);
    const pt = `A cada ${interval} horas, no minuto ${pad2(minute)}.`;
    const times = [];
    for (let h=0; h<24; h+=interval){
      times.push(`${pad2(h)}:${pad2(minute)}`);
    }
    return { tipo:"every_hours", intervalHours:interval, minute, textoPT:pt, listaTimes:times, original:s };
  }

  // every hour at :MM past
  m = s.match(/^Races\s+every\s+hour\s+at\s*:?\s*(\d{1,2})\s+past\s*$/i);
  if (m){
    const minute = parseInt(m[1],10);
    const pt = `A cada 1 hora, no minuto ${pad2(minute)}.`;
    const times = [];
    for (let h=0; h<24; h+=1){
      times.push(`${pad2(h)}:${pad2(minute)}`);
    }
    return { tipo:"every_hour", intervalHours:1, minute, textoPT:pt, listaTimes:times, original:s };
  }

  // every N minutes at :15 and :45 (or similar)
  m = s.match(/^Races\s+every\s+(\d+)\s+minutes?\s+at\s+(.+)$/i);
  if (m){
    const intervalMin = parseInt(m[1],10);
    const rest = m[2];
    // captura :15, :45 etc
    const offs = (rest.match(/:\s*\d{1,2}/g) || []).map(x => parseInt(x.replace(/\D/g,""),10)).filter(v => v>=0 && v<60);
    if (offs.length){
      const pt = `A cada ${intervalMin} minutos, nos minutos ${offs.map(o=>pad2(o)).join(" e ")}.`;
      const times=[];
      for (let h=0; h<24; h++){
        for (const o of offs){
          times.push(`${pad2(h)}:${pad2(o)}`);
        }
      }
      return { tipo:"every_minutes_offsets", intervalMinutes:intervalMin, offsets:offs, textoPT:pt, listaTimes:times, original:s };
    }
  }

  // Fixed GMT like: Races Friday at 19 GMT, Saturday at 7 GMT, Sunday at 18 GMT
  if (/\bGMT\b/i.test(s)){
    const mapDow = {sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6};
    const items=[];
    const parts = s.replace(/^Races\s*/i,"").split(/,\s*/);
    for (const part of parts){
      const mm = part.trim().match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\s+at\s+(\d{1,2})(?::(\d{2}))?\s+GMT$/i);
      if (mm){
        const dow = mapDow[mm[1].toLowerCase()];
        const hour = parseInt(mm[2],10);
        const min = mm[3] ? parseInt(mm[3],10) : 0;
        items.push({dow, hour, min});
      }
    }
    if (items.length){
      const pt = "Horários fixos (GMT) convertidos para seu horário local.";
      return { tipo:"fixed_gmt", items, textoPT:pt, original:s };
    }
  }

  // fallback
  return { tipo:"raw", textoPT:"Horário/agenda da série:", original:s };
}

function buildTwoColTable(times){
  if (!times || !times.length) return "";
  const half = Math.ceil(times.length/2);
  const left = times.slice(0, half);
  const right = times.slice(half);
  let rows = "";
  for (let i=0; i<half; i++){
    const a = left[i] || "";
    const b = right[i] || "";
    rows += `<tr><td>${escHTML(a)}</td><td>${escHTML(b)}</td></tr>`;
  }
  return `<table class="tooltipGrid"><tbody>${rows}</tbody></table>`;
}

function nextOccurrencesFromFixedGMT(items, count=8){
  // Próximas ocorrências (local) a partir de agora, usando os DOW/horário em UTC (GMT).
  const now = new Date();
  const out=[];
  for (let step=0; step<14; step++){ // procura até 2 semanas
    for (const it of items){
      // dia alvo: hoje + step dias, mas tem que bater dow
      const d = new Date(now);
      d.setHours(0,0,0,0);
      d.setDate(d.getDate()+step);
      if (d.getDay() !== it.dow) continue;
      // cria date UTC no dia encontrado
      const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), it.hour, it.min, 0));
      if (utc.getTime() <= now.getTime()) continue;
      // formata local HH:MM e dia
      const day = utc.toLocaleDateString(undefined, {weekday:"short"});
      const time = utc.toLocaleTimeString(undefined, {hour:"2-digit", minute:"2-digit"});
      out.push(`${day} ${time}`);
      if (out.length >= count) return out;
    }
  }
  return out;
}

function buildHorarioTooltipHTML(raw){
  const info = parseScheduleRaw(raw);
  if (!info) return null;

  let title = info.textoPT || "Horários";
  let table = "";
  let sub = "";

  if (info.tipo === "fixed_gmt"){
    const next = nextOccurrencesFromFixedGMT(info.items, 8);
    table = buildTwoColTable(next);
    sub = `Origem: ${info.original}`;
  } else if (info.listaTimes && info.listaTimes.length){
    table = buildTwoColTable(info.listaTimes);
    sub = `Origem: ${info.original}`;
  } else {
    sub = info.original ? `Origem: ${info.original}` : "";
  }

  return `
    <div class="tooltipTitle">${escHTML(title)}</div>
    ${table}
    ${sub ? `<div class="tooltipSub">${escHTML(sub)}</div>` : ``}
  `;
}


function parseISODate(iso){
  // iso: YYYY-MM-DD -> Date (meia-noite local)
  if (!iso) return null;
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
function todayISO(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
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
    const dtConsulta = new Date(); dtConsulta.setHours(0,0,0,0);
  if (!rows.length){
    tbody.innerHTML = `<tr><td colspan="6" class="empty">Nada encontrado.</td></tr>`;
    return;
  }
  for (const d of rows){
    const tr = document.createElement("tr");
        const horarioTd = d.horarios ? `<td class="tdClock"><span class="clock" data-raw="${escHTML(d.horarios)}" aria-label="Horários">⏱</span></td>` : `<td class="tdClock"></td>`;
        // Destaque: se a data de consulta cair na semana desta linha
    const dtIni = parseISODate(d.inicio_semana);
    if (dtConsulta && dtIni){
      const dtFim = new Date(dtIni.getTime());
      dtFim.setDate(dtFim.getDate() + 6);
      if (dtConsulta >= dtIni && dtConsulta <= dtFim){
        tr.classList.add("weekNow");
        tr.title = "Semana da corrida (data de consulta dentro da semana)";
      }
    }
    tr.innerHTML = `
      <td>${escHTML(d.inicio_semana || "")}</td>
      <td>${d.week ?? ""}</td>
      <td>${escHTML(d.categoria || "")}</td>
      <td>${escHTML(d.classe || "")}</td>
      ${horarioTd}
      <td>${escHTML(d.serie || "")}</td>
      <td>${escHTML(d.pista || "")}</td>
      <td>${escHTML(d.carros || "")}</td>
    `;
    tbody.appendChild(tr);
  }
  try{ bindHorarioTooltips(elTabela); }catch(e){}
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

const INDEX_CACHE_KEY = "ipista_index_cache_20260112_0815";

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
  if (elVerInline) elVerInline.textContent = `v${BUILD_VERSION}`;
  document.title = `iPista (Web) v${BUILD_VERSION}`;
  if (elVerInline) elVerInline.textContent = `v${BUILD_VERSION}`;
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
  const PREFER_NETWORK_FIRST = true;
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


function ensureTooltipEl(){
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement("div");
  tooltipEl.className = "tooltipBox";
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}

function showTooltipFor(targetEl, html){
  const el = ensureTooltipEl();
  el.innerHTML = html;
  el.classList.add("show");
  // posiciona próximo do ícone, com clamp na tela
  const r = targetEl.getBoundingClientRect();
  const margin = 10;
  const w = el.offsetWidth || 320;
  const h = el.offsetHeight || 120;
  let x = r.left + (r.width/2) - (w/2);
  let y = r.bottom + 10;
  x = Math.max(margin, Math.min(window.innerWidth - w - margin, x));
  // se não couber embaixo, coloca em cima
  if (y + h + margin > window.innerHeight){
    y = r.top - h - 10;
  }
  y = Math.max(margin, Math.min(window.innerHeight - h - margin, y));
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

function hideTooltip(){
  if (!tooltipEl) return;
  tooltipEl.classList.remove("show");
}

function bindHorarioTooltips(scopeEl=document){
  scopeEl.querySelectorAll(".clock[data-raw]").forEach((node)=>{
    if (node.__ttBound) return;
    node.__ttBound = true;
    node.addEventListener("mouseenter", ()=>{
      if (tooltipHideTimer){ clearTimeout(tooltipHideTimer); tooltipHideTimer=null; }
      const raw = node.getAttribute("data-raw") || "";
      const html = buildHorarioTooltipHTML(raw);
      if (html) showTooltipFor(node, html);
    });
    node.addEventListener("mouseleave", ()=>{
      tooltipHideTimer = setTimeout(hideTooltip, 60);
    });
  });
}

window.addEventListener("scroll", ()=> hideTooltip(), {passive:true});
window.addEventListener("resize", ()=> hideTooltip(), {passive:true});
