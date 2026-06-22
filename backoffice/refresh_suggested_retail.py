#!/usr/bin/env python3
"""
Refresh data/suggested_retail.json from ERP priao_stock_level_quicksight
=========================================================================

ดึงราคาแนะนำขาย (= "ราคาขาย" column ใน ERP page "ProductStock & Price")
จาก ERP ISCode → save เป็น overlay file
ที่ app.js ใช้แสดง "แนะนำขาย XXX" บน product card

USAGE:
    cd backoffice/
    cp .env.example .env       # แล้วใส่ค่าจริง (one-time setup)
    python refresh_suggested_retail.py

REQUIREMENTS:
    pip install psycopg2-binary python-dotenv

SOURCE:
    Database: priao-production (PostgreSQL)
    View:     priao_stock_level_quicksight
    Field:    unit_price (= "ราคาขาย" column on "ProductStock & Price" page in ERP UI)
    Note:     This view aggregates data — unit_price is product-level (same across stores)

OUTPUT:
    ../data/suggested_retail.json
    {
      "_meta": {...},
      "data": {"barcode": price, ...}
    }

LAST UPDATED: 2026-06-19
"""

import json
import os
import re
import sys
from datetime import date
from pathlib import Path

# === Dependency check ===
try:
    import psycopg2
except ImportError:
    print("ERROR: ต้องติดตั้ง psycopg2-binary ก่อน")
    print("   pip install psycopg2-binary")
    sys.exit(1)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("WARNING: python-dotenv ไม่ได้ติดตั้ง — ใช้ env vars ของ shell แทน")
    print("   (แนะนำ: pip install python-dotenv)")

# === Configuration ===
# Read from environment variables (.env file)
DB_CONFIG = {
    "host":     os.getenv("ERP_DB_HOST"),
    "port":     int(os.getenv("ERP_DB_PORT", "5432")),
    "database": os.getenv("ERP_DB_NAME", "priao-production"),
    "user":     os.getenv("ERP_DB_USER"),
    "password": os.getenv("ERP_DB_PASSWORD"),
}

# Validate required config
missing = [k for k, v in DB_CONFIG.items() if not v and k in ("host", "user", "password")]
if missing:
    print(f"ERROR: missing env vars: {', '.join('ERP_DB_' + k.upper() for k in missing)}")
    print("Setup:")
    print("   1. cp .env.example .env")
    print("   2. แก้ค่าใน .env ใส่ credentials จริง")
    print("   3. python refresh_suggested_retail.py")
    sys.exit(1)

# Paths
SCRIPT_DIR = Path(__file__).parent.resolve()
DATA_DIR = SCRIPT_DIR.parent / "data"
OUTPUT_FILE = DATA_DIR / "suggested_retail.json"

# === Step 1: Get catalog barcodes ===
print("=" * 60)
print("Step 1: Loading catalog barcodes from data/*.json")
print("=" * 60)

catalog_barcodes = set()
for cat_code in ["C01", "C02", "C03", "C04", "C05", "C06", "C07", "C08", "C09"]:
    cat_file = DATA_DIR / f"{cat_code}.json"
    if not cat_file.exists():
        print(f"   WARN: {cat_file} not found")
        continue
    products = json.loads(cat_file.read_text(encoding="utf-8"))
    for p in products:
        if p and p[0]:
            catalog_barcodes.add(str(p[0]))

print(f"   Total unique barcodes: {len(catalog_barcodes):,}")
if not catalog_barcodes:
    print("ERROR: ไม่พบ barcode ใน data/*.json — รัน convert.py ก่อน")
    sys.exit(1)

# === Step 2: Query ERP ===
print()
print("=" * 60)
print("Step 2: Connecting to ERP")
print("=" * 60)
print(f"   Host: {DB_CONFIG['host']}")
print(f"   DB:   {DB_CONFIG['database']}")
print(f"   User: {DB_CONFIG['user']}")

try:
    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()
    print("   ✓ Connected")
except Exception as e:
    print(f"ERROR: ไม่สามารถเชื่อมต่อ ERP: {e}")
    sys.exit(1)

print()
print("=" * 60)
print("Step 3: Querying priao_stock_level_quicksight (unit_price)")
print("=" * 60)

query = """
SELECT DISTINCT pid, unit_price
FROM priao_stock_level_quicksight
WHERE unit_price > 0;
"""

try:
    cur.execute(query)
    rows = cur.fetchall()
    print(f"   ✓ Returned {len(rows):,} rows")
except Exception as e:
    print(f"ERROR: query failed: {e}")
    cur.close()
    conn.close()
    sys.exit(1)

cur.close()
conn.close()

# === Step 4: Parse unit_price + filter to catalog ===
print()
print("=" * 60)
print("Step 4: Parsing unit_price + filtering catalog SKUs")
print("=" * 60)

def parse_unit_price(price_val):
    """Parse unit_price (Decimal) → 179 (int) or 179.5 (float)"""
    if price_val is None:
        return 0
    try:
        f = float(price_val)
        return int(f) if f.is_integer() else f
    except (ValueError, TypeError):
        return 0

overlay = {}
zero_count = 0
for pid, unit_price in rows:
    if not pid:
        continue
    pid_str = str(pid)
    if pid_str not in catalog_barcodes:
        continue  # not in our catalog — skip
    price = parse_unit_price(unit_price)
    if price > 0:
        overlay[pid_str] = price
    else:
        zero_count += 1

print(f"   ERP rows matching catalog: {len(overlay) + zero_count:,}")
print(f"   With valid Shop price:     {len(overlay):,}")
print(f"   Zero/invalid prices:       {zero_count:,}")

# Missing barcodes (in catalog but not in ERP)
missing = catalog_barcodes - set(overlay.keys()) - {pid for pid, _ in rows if str(pid) in catalog_barcodes}
print(f"   Missing from ERP:          {len(missing):,}")
print(f"   Coverage:                  {100*len(overlay)/len(catalog_barcodes):.1f}%")

# === Step 5: Write overlay file ===
print()
print("=" * 60)
print(f"Step 5: Writing {OUTPUT_FILE.relative_to(SCRIPT_DIR.parent)}")
print("=" * 60)

output = {
    "_meta": {
        "source": "ERP priao_stock_level_quicksight.unit_price (= ProductStock & Price page → ราคาขาย column)",
        "description": "ราคาแนะนำขายต่อให้ผู้บริโภคปลายทาง",
        "sql": "SELECT DISTINCT pid, unit_price FROM priao_stock_level_quicksight WHERE unit_price > 0",
        "count": len(overlay),
        "catalog_total": len(catalog_barcodes),
        "coverage_pct": round(100 * len(overlay) / len(catalog_barcodes), 1),
        "last_updated": date.today().isoformat(),
        "refresh_script": "backoffice/refresh_suggested_retail.py",
    },
    "data": dict(sorted(overlay.items())),
}

# Backup current file
if OUTPUT_FILE.exists():
    backup = OUTPUT_FILE.with_suffix(".json.bak")
    backup.write_bytes(OUTPUT_FILE.read_bytes())
    print(f"   ✓ Backup → {backup.name}")

# Write new file with fsync
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    json.dump(output, f, ensure_ascii=False, indent=2)
    f.flush()
    os.fsync(f.fileno())

print(f"   ✓ Wrote {OUTPUT_FILE.stat().st_size:,} bytes ({len(overlay):,} entries)")

# === Step 6: Report ===
print()
print("=" * 60)
print("✓ DONE")
print("=" * 60)
print(f"   Catalog SKUs:      {len(catalog_barcodes):,}")
print(f"   unit_prices:       {len(overlay):,} ({100*len(overlay)/len(catalog_barcodes):.1f}%)")
print(f"   Missing:           {len(catalog_barcodes) - len(overlay):,}")
print()
print("Next steps:")
print("   1. Verify: cat ../data/suggested_retail.json | head -30")
print("   2. Test in browser: open catalog → product card should show 'แนะนำขาย XXX'")
print("   3. Commit: git add ../data/suggested_retail.json && git commit -m 'chore: refresh suggested_retail'")
print("   4. Push: git push")
print()
