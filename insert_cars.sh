#!/usr/bin/env bash
set -euo pipefail

# insert_cars.sh
# Usage: ./insert_cars.sh [path/to/app.db]
# If no DB path provided, defaults to ./data/app.db

DB_PATH="${1:-./data/app.db}"
INS_DATE="2027-03-12"  # ISO format for 12/03/2027

colors=(
  "#FF6633" "#FFB399" "#FF33FF" "#FFFF99" "#00B3E6" "#E6B333" "#3366E6" "#999966" "#99FF99" "#B34D4D"
  "#80B300" "#809900" "#E6B3B3" "#6680B3" "#66991A" "#FF99E6" "#CCFF1A" "#FF1A66" "#E6331A" "#33FFCC"
  "#66994D" "#B366CC" "#4D8000" "#B33300" "#CC80CC"
)

entries=(
"TIPO 1.6||FR272VV|media"
"TIPO 1.3||FW596EC|media"
"TIPO 1.6|Automatica|FZZ249RM|media"
"TOURAN|7 POSTI|ETT314LJ|grande"
"CORSA||FGG852NP|piccola"
"320D||ETT256EY|media"
"DUCATO|9 Posti|FEE694YJ|grande"
"TALENTO|9 posti|GCC053MN|grande"
"MEGANE||FFF379ED|media"
"DUCATO|LUNGO|FAA771NY|grande"
"DUCATO|CORTO|FSS078TR|grande"
"TRANSIT||FGG631ST|grande"
"LANCIA Y||FBB241VX|piccola"
)

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 CLI non trovato. Installa sqlite3 sul VPS prima di eseguire lo script." >&2
  exit 2
fi

echo "Using DB: $DB_PATH"

# If table exists, delete all existing rows to start fresh
table_exists=$(sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' AND name='cars';") || table_exists=""
if [ "$table_exists" = "cars" ]; then
  echo "Deleting existing rows from 'cars' table..."
  sqlite3 "$DB_PATH" "DROP TABLE cars;"

else
  echo "Table 'cars' not found in DB; inserts will create rows if table exists later."
fi


for e in "${entries[@]}"; do
  IFS='|' read -r modello descrizione plate size <<< "$e"
  # pick random color
  idx=$((RANDOM % ${#colors[@]}))
  color=${colors[$idx]}
  # escape single quotes for SQL (replace ' with '')
  esc_modello=${modello//\'/\'\'}
  esc_descrizione=${descrizione//\'/\'\'}
  esc_plate=${plate//\'/\'\'}
  esc_color=${color//\'/\'\'}
  esc_size=${size//\'/\'\'}

  sql="INSERT OR IGNORE INTO cars (modello, descrizione, color, size, plate, insurance_expiry_iso) VALUES ('$esc_modello', '$esc_descrizione', '$esc_color', '$esc_size', '$esc_plate', '$INS_DATE');"
  sqlite3 "$DB_PATH" "$sql"
  echo "Inserted (or ignored if duplicate): $modello / $descrizione / $plate / $size / $color / $INS_DATE"
done

echo "Done. Verify inserted rows with: sqlite3 '$DB_PATH' 'SELECT id,name,plate,size,insurance_expiry_iso FROM cars ORDER BY id DESC LIMIT 20;'
"
