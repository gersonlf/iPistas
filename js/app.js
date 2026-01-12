// iPista (Web) - lê assets/SeasonSchedule.pdf, cria índice de pistas e filtra
// PDF.js: https://mozilla.github.io/pdf.js/

const PDF_PATH = "assets/SeasonSchedule.pdf";
const CACHE_KEY = "ipista_pdf_cache_v2"; // troque se alterar parsing

const CATEGORIAS = ["OVAL", "SPORTS CAR", "FORMULA CAR", "DIRT OVAL", "DIRT ROAD", "UNRANKED"];
const CLASSES = ["R","D","C","B","A"];

const elDot = document.getElementById("dot");
const elStatus = document.getElementById("statusTxt");
const elLoading = document.getElementById("loading");
const elLoadingSub = document.getElementById("loadingSub");
const elCacheInfo = document.getElementById("cacheInfo");

const trackInput = document.getElementById("trackInput");
const seriesFilter = document.getElementById("seriesFilter");
const btnSearch = document.getElementById("btnSearch");
const btnClear = document.getElementById("btnClear");

const dropdown = document.getElementById("dropdown");
const btnToggleDrop = document.getElementById("toggleDrop");

const catsWrap = document.getElementById("cats");
const classesWrap = document.getElementById("classes");

const resultTitle = document.getElementById("resultTitle");
const resultSub = document.getElementById("resultSub");
const tbody = document.getElementById("tbody");

let dados = [];      // [{categoria, classe, serie, week, inicio_semana, pista, carros}]
let pistas = [];     // unique track list
let pistasFiltradas = [];
let selIndex = -1;

function setStatus(txt, color){
  elStatus.textContent = txt;
  elDot.style.background = color || "#33d17a";
}

function showLoading(txt){
  elLoadingSub.textContent = txt || "Processando…";
  elLoading.hidden = false;
  trackInput.disabled = true;
  seriesFilter.disabled = true;
  btnSearch.disabled = true;
  btnClear.disabled = true;
  btnToggleDrop.disabled = true;
  setStatus("Aguarde…", "#ffcc00");
}

function hideLoading(){
  elLoading.hidden = true;
  trackInput.disabled = false;
  seriesFilter.disabled = false;
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

    div.addEventListener("mousedown", (ev) => {
      // evita o browser “dar foco” no item
      ev.preventDefault();
    });

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
  if (!pistasFiltradas.length){
    dropdown.hidden = true;
    return;
  }
  dropdown.hidden = false;
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
  if (dropdown.hidden){
    filterTracks();
    openDropdown();
  } else {
    closeDropdown();
  }
  keepFocusAtEnd();
});

trackInput.addEventListener("input", () => {
  filterTracks();
});

trackInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape"){
    if (!dropdown.hidden){
      closeDropdown();
      ev.preventDefault();
      return;
    }
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
    if (!dropdown.hidden && selIndex >= 0 && pistasFiltradas[selIndex]){
      selectTrack(pistasFiltradas[selIndex]);
      closeDropdown();
      ev.preventDefault();
      return;
    }
  }
});

// fecha dropdown ao clicar fora
document.addEventListener("mousedown", (ev) => {
  const inside = ev.target === trackInput || ev.target === btnToggleDrop || dropdown.contains(ev.target);
  if (!inside) closeDropdown();
});

// ===== PDF parsing =====
async function sha256Hex(buf){
  const hashBuffer = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(hashBuffer);
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

function loadCache(){
  try{
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  }catch(_){
    return null;
  }
}

function saveCache(obj){
  try{
    localStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  }catch(_){}
}

function looksLikeSeriesTitle(line){
  // qualquer coisa contendo "20xx Season"
  return /\b20\d{2}\s+Season\b/i.test(line);
}

function isCategoryLine(line){
  return CATEGORIAS.includes(line);
}

function parseClassGroup(line){
  // Ex.: "R Class Series (OVAL)"
  const m = line.match(/^([RDCBA])\s+Class\s+Series\s*\((.+)\)$/i);
  if (!m) return null;
  return { classe: m[1].toUpperCase(), grupo: m[2].trim() };
}

function parseWeekLine(line){
  // Ex.: "Week 1 (2025-12-16) Charlotte Motor Speedway - Oval"
  const m = line.match(/^Week\s+(\d+)\s+\((\d{4}-\d{2}-\d{2})\)\s+(.*)$/i);
  if (!m) return null;
  return { week: parseInt(m[1],10), inicio_semana: m[2], pista_raw: m[3].trim() };
}

function isWeekGarbage(line){
  // linhas que aparecem dentro do bloco do week e não são carros
  if (!line) return true;
  if (/^\(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(line)) return true;
  if (/\b\d+\s+laps\b/i.test(line)) return true;
  if (/°F\//.test(line)) return true;
  if (/Rain chance|Rolling start|Cautions|Qual scrutiny|Lucky dog|Single-file|Double-file|Start zone/i.test(line)) return true;
  if (/^\d+$/.test(line)) return true;
  return false;
}

function isSeriesMeta(line){
  // meta da série (não é carro)
  if (!line) return true;
  if (/Races?\s+/i.test(line)) return true;
  if (/Min entries/i.test(line)) return true;
  if (/No incident/i.test(line)) return true;
  if (/Penalty/i.test(line)) return true;
  if (/Rookie\s+\d/i.test(line)) return true;
  if (/See race week/i.test(line)) return true;
  return false;
}

function cleanTrack(raw){
  let s = (raw || "").replace(/\s+/g," ").trim();
  // corta se vier “grudado” com clima/voltas (às vezes)
  s = s.replace(/\b\d+°F\/\d+°C.*$/,"").trim();
  s = s.replace(/\b\d+\s+laps\b.*$/i,"").trim();
  return s;
}

function joinIfWrapped(track, nextLine){
  // se track termina com "-" ou se a próxima linha é um pedaço “curto” que não parece meta,
  // juntamos (ex.: "World Wide Technology Raceway (Gateway) -" + "Oval")
  if (!nextLine) return null;
  const nl = nextLine.trim();
  if (!nl) return null;
  if (/^\(/.test(nl)) return null;
  if (/^Week\s+\d+\s+\(/i.test(nl)) return null;
  if (looksLikeSeriesTitle(nl)) return null;
  if (isCategoryLine(nl)) return null;
  if (parseClassGroup(nl)) return null;
  if (isWeekGarbage(nl)) return null;

  if (track.endsWith("-")) return (track + " " + nl).replace(/\s+/g," ").trim();
  // casos de quebra sem hífen são difíceis; então só junta quando o próximo é bem curto:
  if (nl.length <= 18) return (track + " " + nl).replace(/\s+/g," ").trim();
  return null;
}

function groupLines(textItems){
  // Reconstrói linhas agrupando por coordenada Y
  const pts = textItems
    .filter(it => it.str && it.str.trim())
    .map(it => {
      const x = it.transform[4];
      const y = it.transform[5];
      return { x, y, str: it.str.trim() };
    });

  pts.sort((a,b) => (b.y - a.y) || (a.x - b.x));

  const lines = [];
  let cur = null;
  const tol = 2.0;

  for (const p of pts){
    if (!cur || Math.abs(p.y - cur.y) > tol){
      cur = { y: p.y, parts: [p] };
      lines.push(cur);
    } else {
      cur.parts.push(p);
    }
  }

  return lines.map(l => {
    l.parts.sort((a,b)=>a.x-b.x);
    return l.parts.map(p=>p.str).join(" ").replace(/\s+/g," ").trim();
  });
}

async function parsePdfToData(arrayBuffer){
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const total = pdf.numPages;

  let categoriaAtual = "";
  let classeAtual = "";
  let grupoAtual = "";
  let serieAtual = "";
  let carrosSerie = "";
  let coletandoCarros = false;
  let bufferCarros = [];

  const out = [];

  for (let p=1; p<=total; p++){
    showLoading(`Lendo o PDF… página ${p}/${total}`);

    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lines = groupLines(content.items);

    for (let i=0; i<lines.length; i++){
      const line = lines[i].trim();
      if (!line) continue;

      if (isCategoryLine(line)){
        categoriaAtual = line;
        classeAtual = "";
        grupoAtual = "";
        serieAtual = "";
        carrosSerie = "";
        coletandoCarros = false;
        bufferCarros = [];
        continue;
      }

      const g = parseClassGroup(line);
      if (g){
        classeAtual = g.classe;
        grupoAtual = g.grupo;
        serieAtual = "";
        carrosSerie = "";
        coletandoCarros = false;
        bufferCarros = [];
        continue;
      }

      if (looksLikeSeriesTitle(line)){
        if (coletandoCarros){
          carrosSerie = bufferCarros.join(" ").replace(/\s+/g," ").trim();
          bufferCarros = [];
        }
        serieAtual = line.replace(/\s+\.+\s*$/,"").trim();
        coletandoCarros = true;
        carrosSerie = "";
        bufferCarros = [];
        continue;
      }

      if (coletandoCarros){
        const w = parseWeekLine(line);
        if (w || isCategoryLine(line) || parseClassGroup(line) || looksLikeSeriesTitle(line)){
          carrosSerie = bufferCarros.join(" ").replace(/\s+/g," ").trim();
          bufferCarros = [];
          coletandoCarros = false;
          // cai no fluxo
        } else {
          if (!isSeriesMeta(line) && !/^\d+$/.test(line)){
            bufferCarros.push(line);
          }
          continue;
        }
      }

      const w = parseWeekLine(line);
      if (w){
        let pista = cleanTrack(w.pista_raw);

        if (i+1 < lines.length){
          const joined = joinIfWrapped(pista, lines[i+1]);
          if (joined){
            pista = cleanTrack(joined);
            i += 1;
          }
        }

        const carrosWeek = [];
        let j = i + 1;
        while (j < lines.length){
          const ln2 = lines[j].trim();

          if (!ln2){ j++; continue; }
          if (isCategoryLine(ln2)) break;
          if (parseClassGroup(ln2)) break;
          if (looksLikeSeriesTitle(ln2)) break;
          if (parseWeekLine(ln2)) break;

          if (isWeekGarbage(ln2)){ j++; continue; }
          if (isSeriesMeta(ln2)){ j++; continue; }

          carrosWeek.push(ln2);
          j++;
        }

        const carrosFinal = carrosWeek.length
          ? carrosWeek.join(" ").replace(/\s+/g," ").trim()
          : (carrosSerie || "");

        out.push({
          categoria: categoriaAtual || "",
          classe: classeAtual || "",
          grupo: grupoAtual || "",
          serie: serieAtual || "",
          week: w.week,
          inicio_semana: w.inicio_semana,
          pista: pista,
          carros: carrosFinal
        });

        i = j - 1;
        continue;
      }
    }
  }

  return out;
}

function uniqueTracks(items){
  const set = new Set();
  for (const d of items){
    if (d.pista) set.add(d.pista);
  }
  return [...set].sort((a,b)=>a.localeCompare(b));
}

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
      <td>${escHTML(d.carros || "")}</td>
    `;
    tbody.appendChild(tr);
  }
}

function applyFilters(){
  const pistaSel = trackInput.value.trim();
  resultTitle.textContent = pistaSel ? `Pista: ${pistaSel}` : "Pista: (nenhuma)";

  const fSerie = norm(seriesFilter.value);
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
    return true;
  });

  rows.sort((a,b) => (a.inicio_semana || "").localeCompare(b.inicio_semana || "") || (a.week - b.week) || (a.serie || "").localeCompare(b.serie || ""));
  renderTable(rows);

  const total = dados.length;
  resultSub.textContent = `Resultados: ${rows.length} (de ${total})`;
}

btnSearch.addEventListener("click", () => {
  setStatus("Filtrando…", "#ffcc00");
  applyFilters();
  setStatus("Pronto", "#33d17a");
});

btnClear.addEventListener("click", () => {
  trackInput.value = "";
  seriesFilter.value = "";
  catChecks.forEach(c => c.checked = true);
  classChecks.forEach(c => c.checked = true);
  closeDropdown();
  filterTracks();
  applyFilters();
  keepFocusAtEnd();
});

[catsWrap, classesWrap].forEach(el => {
  el.addEventListener("change", () => applyFilters());
});
seriesFilter.addEventListener("input", () => applyFilters());

async function boot(){
  try{
    showLoading("Baixando o PDF do projeto…");

    const resp = await fetch(PDF_PATH, { cache: "no-store" });
    if (!resp.ok) throw new Error(`Não consegui abrir: ${PDF_PATH}`);

    const buf = await resp.arrayBuffer();
    const hash = await sha256Hex(buf);

    const cache = loadCache();
    if (cache && cache.hash === hash && Array.isArray(cache.dados) && cache.dados.length){
      dados = cache.dados;
      pistas = cache.pistas || uniqueTracks(dados);
      pistasFiltradas = pistas.slice();
      renderDropdown();
      closeDropdown();
      hideLoading();
      setStatus("Pronto (cache)", "#33d17a");
      elCacheInfo.textContent = "Cache: sim";
      applyFilters();
      return;
    }

    elCacheInfo.textContent = "Cache: não";
    dados = await parsePdfToData(buf);
    pistas = uniqueTracks(dados);

    saveCache({ hash, dados, pistas, savedAt: new Date().toISOString() });

    pistasFiltradas = pistas.slice();
    renderDropdown();
    closeDropdown();
    hideLoading();
    setStatus("Pronto", "#33d17a");
    applyFilters();
  }catch(e){
    hideLoading();
    setStatus("Erro", "#ffcc00");
    tbody.innerHTML = `<tr><td colspan="6" class="empty">Erro ao abrir o PDF. Veja o console.</td></tr>`;
    console.error(e);
    alert(String(e));
  }
}

boot();
