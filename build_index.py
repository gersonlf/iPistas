# build_index.py
# Gera data/index.json a partir de assets/SeasonSchedule.pdf
# Requisitos: pip install pymupdf
import os, re, json, hashlib
import fitz

BASE = os.path.dirname(os.path.abspath(__file__))
PDF_PATH = os.path.join(BASE, "assets", "SeasonSchedule.pdf")
OUT_PATH = os.path.join(BASE, "data", "index.json")

CATEGORIAS = set(["OVAL","SPORTS CAR","FORMULA CAR","DIRT OVAL","DIRT ROAD","UNRANKED"])

def looks_series(line: str) -> bool:
    return re.search(r"\b20\d{2}\s+Season\b", line, re.I) is not None

def parse_class_group(line: str):
    m = re.match(r"^([RDCBA])\s+Class\s+Series\s*\((.+)\)\s*$", line, re.I)
    if m:
        return m.group(1).upper(), m.group(2).strip()
    return None

def parse_week_header(line: str):
    m = re.match(r"^Week\s+(\d+)\s+\((\d{4}-\d{2}-\d{2})\)\s*$", line, re.I)
    if m:
        return int(m.group(1)), m.group(2)
    return None

def is_schedule(line: str) -> bool:
    # Linhas típicas: "Races every 30 minutes at :15 and :45", "Races Friday at 19 GMT, ...", etc.
    return bool(re.match(r"^Races\b", line.strip(), re.I))

def is_meta(line: str) -> bool:
    return bool(re.search(r"Rookie|Pro/WC|Races every|Min entries|No incident|DQ at|Penalty|See race week|Split at|Drops:", line, re.I))

def is_garbage(line: str) -> bool:
    s = line.strip()
    if not s: return True
    if s.startswith("("): return True
    if "°F/" in s: return True
    if re.search(r"Rain chance|Rolling start|Cautions|Qual scrutiny|Start zone|Lucky dog|Single-file|Double-file", s, re.I): return True
    if re.search(r"\b\d+\s+laps\b", s, re.I): return True
    return False

def clean_spaces(s: str) -> str:
    return re.sub(r"\s+"," ",s).strip()

def try_join(line: str, next_line: str):
    if not next_line: 
        return line, False
    nl = next_line.strip()
    if not nl: 
        return line, False
    if nl.startswith("("): 
        return line, False
    if nl in CATEGORIAS or parse_class_group(nl) or looks_series(nl) or parse_week_header(nl):
        return line, False
    if is_meta(nl) or is_garbage(nl):
        return line, False
    if line.endswith("-"):
        return clean_spaces(line + " " + nl), True
    if len(nl) <= 22:
        return clean_spaces(line + " " + nl), True
    return line, False

def main():
    os.makedirs(os.path.join(BASE, "data"), exist_ok=True)

    with open(PDF_PATH, "rb") as f:
        pdf_bytes = f.read()
    pdf_sha = hashlib.sha256(pdf_bytes).hexdigest()

    doc = fitz.open(PDF_PATH)

    records = []
    categoria = ""
    classe = ""
    grupo = ""
    serie = ""
    carros_serie = ""
    horarios_serie = ""
    collecting_cars = False
    car_buffer = []

    for p in range(len(doc)):
        text = doc[p].get_text("text")
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        i = 0
        while i < len(lines):
            line = lines[i]

            if line in CATEGORIAS:
                categoria = line
                classe = grupo = serie = ""
                carros_serie = ""
                horarios_serie = ""
                collecting_cars = False
                car_buffer = []
                i += 1
                continue

            cg = parse_class_group(line)
            if cg:
                classe, grupo = cg
                serie = ""
                carros_serie = ""
                horarios_serie = ""
                collecting_cars = False
                car_buffer = []
                i += 1
                continue

            if looks_series(line):
                serie = re.sub(r"\s+\.+\s*$","", line).strip()
                collecting_cars = True
                car_buffer = []
                i += 1
                continue

            if collecting_cars:
                wk = parse_week_header(line)
                if wk or line in CATEGORIAS or parse_class_group(line) or looks_series(line) or is_meta(line):
                    carros_serie = clean_spaces(" ".join(car_buffer))
                    collecting_cars = False
                    # Após capturar a lista de carros, o PDF costuma trazer uma linha de horários (Races ...)
                    # Vamos capturar a primeira que aparecer.
                    horarios_serie = ""

                else:
                    if not is_garbage(line) and not is_meta(line):
                        car_buffer.append(line)
                    i += 1
                    continue

            # Captura horários (por série): primeira linha que começa com "Races"
            if serie and is_schedule(line) and not horarios_serie:
                horarios_serie = clean_spaces(line)
                i += 1
                continue

            wk = parse_week_header(line)
            if wk:
                week, start = wk
                track = ""
                j = i + 1
                while j < len(lines):
                    ln = lines[j].strip()
                    if parse_week_header(ln) or ln in CATEGORIAS or parse_class_group(ln) or looks_series(ln):
                        break
                    if is_garbage(ln) or is_meta(ln):
                        j += 1
                        continue
                    track = clean_spaces(ln)
                    used = False
                    if j + 1 < len(lines):
                        track, used = try_join(track, lines[j+1])
                        if used:
                            j += 1
                    j += 1
                    break

                records.append({
                    "inicio_semana": start,
                    "week": week,
                    "categoria": categoria,
                    "classe": classe,
                    "grupo": grupo,
                    "serie": serie,
                    "pista": track,
                    "carros": carros_serie,
                    "horarios": horarios_serie
                })

                i = j
                continue

            i += 1

    tracks = sorted({r["pista"] for r in records if r.get("pista")})

    idx = {
        "version": 2,
        "pdf_file": "assets/SeasonSchedule.pdf",
        "pdf_sha256": pdf_sha,
        "records": records,
        "tracks": tracks
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(idx, f, ensure_ascii=False)

    print(f"OK: {len(records)} registros, {len(tracks)} pistas -> {OUT_PATH}")

if __name__ == "__main__":
    main()
