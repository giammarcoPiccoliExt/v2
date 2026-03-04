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
"TIPO 1.6|FR 272 VV|media"
"TIPO 1.3|FW 596 EC|media"
"TIPO 1.6 Automatica|FZ 249 RM|media"
"TOURAN 7 POSTI|ET 314 LJ|grande"
"CORSA|FG 852 NP|piccola"
"320D|ET 256 EY|media"
"DUCATO 9 Posti|FE 694 YJ|grande"
"TALENTO 9 posti|GC 053 MN|grande"
"MEGANE|FF 379 ED|media"
"DUCATO LUNGO|FA 771 NY|grande"
"DUCATO CORTO|FS 078 TR|grande"
"TRANSIT|FG 631 ST|grande"
"LANCIA Y|FB 241 VX|piccola"
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
  sqlite3 "$DB_PATH" "DELETE FROM cars;"
  # reset AUTOINCREMENT counter if sqlite_sequence present
  sqlite3 "$DB_PATH" "DELETE FROM sqlite_sequence WHERE name='cars';" 2>/dev/null || true
else
  echo "Table 'cars' not found in DB; inserts will create rows if table exists later."
fi

for e in "${entries[@]}"; do
  IFS='|' read -r name plate size <<< "$e"
  # pick random color
  idx=$((RANDOM % ${#colors[@]}))
  color=${colors[$idx]}
    # escape single quotes for SQL (replace ' with '')
    esc_name=${name//\'/\'\'}
    esc_plate=${plate//\'/\'\'}
    esc_color=${color//\'/\'\'}
    esc_size=${size//\'/\'\'}

  sql="INSERT OR IGNORE INTO cars (name, color, size, plate, insurance_expiry_iso) VALUES ('$esc_name', '$esc_color', '$esc_size', '$esc_plate', '$INS_DATE');"
  sqlite3 "$DB_PATH" "$sql"
  echo "Inserted (or ignored if duplicate): $name / $plate / $size / $color / $INS_DATE"
done

echo "Done. Verify inserted rows with: sqlite3 '$DB_PATH' 'SELECT id,name,plate,size,insurance_expiry_iso FROM cars ORDER BY id DESC LIMIT 20;'
"
