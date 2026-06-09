# 🔧 CLAUDE.md — กฎเหล็กสำหรับ Claude ทำงานบนโปรเจกต์นี้

**โปรเจกต์:** เปรียว คอสเมติกส์ — VIP Catalog (Static site บน GitHub Pages)
**Stack:** Vanilla HTML/CSS/JS + LIFF SDK + JSON data + Python converter
**ไฟล์นี้สำหรับ:** Claude อ้างอิงทุกครั้งที่แก้โปรเจกต์นี้ — กันความผิดพลาดซ้ำ

---

## 🚫 กฎต้องห้าม (เคยพลาดมาแล้ว — ห้ามทำซ้ำ)

### 1. JavaScript Temporal Dead Zone (TDZ)
`const`/`let` ห้ามใช้ก่อน declare บรรทัดเดียวกับ scope ของมัน — JS จะ throw `ReferenceError` ทันที (runtime error, ไม่ใช่ syntax)

```js
// ❌ ผิด
const hasStrike = !isOutOfStock && ...;     // ใช้ isOutOfStock ก่อน define
const isOutOfStock = prod && prod.stock <= 0;

// ✅ ถูก
const isOutOfStock = prod && prod.stock <= 0;
const hasStrike = !isOutOfStock && ...;
```

**กฎ:** ก่อน refactor function ใหญ่ ให้ list ตัวแปรทั้งหมดและลำดับ define ก่อน

### 2. Edit tool truncate ไฟล์ใหญ่ (>100KB)
Mounted filesystem ของ Cowork มี buffer ~100KB ตอน Edit ไฟล์ใหญ่ — จะตัดท้าย/glitch UTF-8

```python
# ❌ ผิด — สำหรับไฟล์ใหญ่ (>50KB) อาจ truncate
Edit(file_path=..., old_string=..., new_string=...)

# ✅ ถูก — เขียนผ่าน Python + fsync
with open(path, "w", encoding="utf-8") as f:
    f.write(content)
    f.flush()
    import os; os.fsync(f.fileno())
```

**กฎ:** ไฟล์ > 30KB ใช้ Python write + verify UTF-8 decode หลังเขียนทุกครั้ง

### 3. node --check ไม่จับ runtime error
`node --check js/app.js` ผ่าน ≠ โค้ดทำงานได้

ต้อง test runtime ด้วย:
```bash
node <<'NODE'
// Simulate calling the function
const cart = [...]; const allProducts = [...];
// extract function body and run
NODE
```

**กฎ:** หลังแก้ logic ใน function สำคัญ (renderCart, buildFlexBubble, sendOrder) → ต้อง runtime test

### 4. Mounted filesystem ลบไฟล์ user ไม่ได้
`rm` ผ่าน bash จะ fail (Operation not permitted) — แต่ overwrite ผ่าน Python `write_text()` ได้

**กฎ:** ห้ามใช้ `rm` กับไฟล์ใน user folder — แนะนำ user ลบเอง หรือ overwrite แทน

---

## 📋 โครงสร้างข้อมูลห้ามผิด

### JSON product array (`data/CXX.json`)

```
[0]  barcode (string, 13 หลัก)
[1]  name (string)
[2]  subcategory (string)
[3]  tag — "สินค้าขายดี" / "สินค้าหมดชั่วคราว" / "สินค้าใหม่" / ""
[4]  price (number)
[5]  stock (int)
[6]  image_url (string, URL)
[7]  brand_key (string, "EN_NAME ไทย")
[8]  pack_qty (int)
[9]  pack_label — เช่น "1 / แท่ง"
[10] flag — 1=A / 2=New / 3=B

# Optional (เฉพาะรายการที่มีโปร — array ยาว 14):
[11] promo_type — "sale" / "bundle" / "flash" / ""
[12] promo_label — ข้อความ ribbon
[13] original_price (number, ราคาก่อนลด)
```

**กฎ:** อย่าเปลี่ยนลำดับ index — ต้อง backward compatible (รายการเก่า 11 elements ต้องใช้ได้)

### Excel template columns (1-based)

| # | Field |
|---|---|
| 1 | หมวดสินค้า |
| 2 | หมวดย่อยสินค้า |
| 3 | รหัสสินค้า |
| 4 | ชื่อสินค้า |
| 5 | จำนวน/หน่วย |
| 6 | หน่วย |
| 7 | แบรนด์ |
| 8 | PSaleStatus (A/B/New) |
| 9 | Tag |
| 10 | price_wholesale |
| 11 | OnStockFG |
| 12 | ลิงก์รูปภาพ (hyperlink) |
| 13 | promo_type |
| 14 | promo_label |
| 15 | original_price |

**สำคัญ:** ลิงก์รูป **ต้องเป็น hyperlink ของ cell** ไม่ใช่ text — อ่านจาก `cell.hyperlink.target`

### Category mapping (ต้อง sync 3 ที่)

```
เครื่องสำอาง        → C01
ผลิตภัณฑ์ดูแลผิวหน้า → C02
ผลิตภัณฑ์ดูแลผิวกาย  → C03
ผลิตภัณฑ์ดูแลเส้นผม  → C04
น้ำหอม              → C05
อุปกรณ์เพื่อความงาม  → C06
อาหารเสริม          → C07
คอนซูเมอร์          → C08
แฟชั่น&ไลฟ์สไตล์    → C09
```

**กฎ:** ถ้าเพิ่ม/แก้หมวด ต้อง update ทั้ง 3 ไฟล์พร้อมกัน:
- `js/app.js` (CAT_NAMES)
- `backoffice/convert.py` (CATEGORY_MAP)
- `backoffice/converter.html` (CATEGORY_MAP)

---

## 🎨 Brand Identity (ห้ามเปลี่ยน)

| สี | Hex | ใช้ที่ไหน |
|---|---|---|
| **Priao Blue (Primary)** | `#25a9e0` / `#2080BE` | accent, header, button หลัก |
| **Dark accent** | `#0065a8` / `#0a1628` | text หลัก |
| Border | `#b8d9f0` | กรอบกล่อง |
| Background | `#f4f8fc` | พื้นเว็บ |
| Light bg | `#e6f1fb` | hover, badge |

| สี promo ribbon | Hex | ประเภท |
|---|---|---|
| 🟧 Sale | `#F59E0B` | ลดราคา |
| 🟦 Bundle | `#2080BE` | ซื้อ X แถม Y |
| 🟥 Flash | `#DC2626` | เร่งด่วน |
| ⬛ Preorder | `#6B7280` | สินค้าหมด |

**ห้าม:** สีชมพูเป็นสีหลัก (Priao policy)

**Font:** Noto Sans Thai (web) / TH Sarabun New (เอกสาร)

---

## 🔒 LIFF & Flex Constraints

### URI Action limit
LINE Flex Message → URI action: **max 1000 chars**

```js
// ❌ อย่าใส่ text ยาวๆ ลง URL ตรงๆ
uri: 'copy.html?text=' + longText  // อาจเกิน

// ✅ ใช้ base64-encoded + truncate progressively
const URL_BUDGET = 950;
// ใช้ buildCopyUrl() ที่มี fallback ลด name length
```

### liff.closeWindow()
ใช้ปิด page ใน LIFF in-app browser — `window.close()` / `history.back()` มักไม่ work

```js
if(typeof liff !== 'undefined' && liff.closeWindow){
  try{ liff.closeWindow(); return; } catch(e){}
}
// fallback ลำดับถัดไป...
```

### Static site ส่ง Flex auto ไม่ได้บน PC
- LIFF `sendMessages()` ทำงานเฉพาะใน LINE app
- PC fallback ใช้ `line.me/R/msg/text/?text=...` (pre-fill text only)
- ส่ง Flex อัตโนมัติต้องมี backend (Messaging API push)

---

## 📂 โครงสร้างโปรเจกต์ (ห้ามย้าย)

```
Whosale_Catalogs/
├── index.html           ← เว็บหลัก (~23 KB, ห้ามฝัง base64)
├── copy.html            ← หน้า copy clipboard (LIFF endpoint สำรอง)
├── css/styles.css       ← style ทั้งหมด
├── js/app.js            ← logic ทั้งหมด
├── data/
│   ├── index.json       ← list หมวด
│   └── C01-C09.json     ← per-category data
├── assets/
│   ├── logo.jpg
│   ├── categories/      ← C01-C09 icons
│   └── brands/          ← <BRAND_KEY>.png/jpg
├── backoffice/
│   ├── converter.html   ← Excel → JSON (drag-drop)
│   ├── convert.py       ← CLI converter
│   └── README.md
└── docs/screenshots/
```

**กฎ:**
- ห้ามเอา base64 image กลับเข้า HTML/JS — รักษาขนาด `index.html` < 50 KB
- ห้ามเปลี่ยน path — `index.html` reference `js/app.js`, `css/styles.css`, `data/*.json` แบบ relative
- ห้าม case-sensitive ผิด — GitHub Pages ใช้ Linux server (`CERAVE.png` ≠ `cerave.png`)

---

## ✅ Workflow ก่อนเสนอการแก้

1. **เข้าใจ requirement** — ถ้าไม่ชัด ถาม clarifying question ก่อน
2. **ออกแบบก่อน implement** — แสดง mockup/visualize widget ให้ user เห็น
3. **ทำเป็น phase เล็กๆ** — แต่ละ step verify ผ่านก่อนทำต่อ
4. **ไฟล์ใหญ่ใช้ Python write** — กัน truncate
5. **Runtime test** หลังแก้ logic — ไม่ใช่แค่ syntax check
6. **บอก user ว่าต้อง push ไฟล์ไหนบ้าง** — เป็น list ชัดเจน
7. **เตือน user ต้อง clear LINE cache** ก่อน test LIFF
8. **Verify ใน production** — เปิด URL deployed ดูจริงหลัง push

---

## 🔍 Testing Checklist หลังแก้สำคัญ

```bash
# 1. Syntax check
node --check js/app.js

# 2. Python syntax check (สำหรับ convert.py)
python3 -c "import ast; ast.parse(open('backoffice/convert.py').read())"

# 3. UTF-8 valid
python3 -c "open('js/app.js','rb').read().decode('utf-8'); print('OK')"

# 4. File size sanity
stat -c %s js/app.js   # ควรประมาณ 100-130KB

# 5. JSON valid
python3 -c "import json; [json.load(open(f'data/{c}.json')) for c in 'C01 C02 C03 C04 C05 C06 C07 C08 C09'.split()]"

# 6. Functions exist
grep -c "function buildOrderMessages\|function renderCart\|function buildFlexBubble" js/app.js
```

---

## 🗣️ สไตล์การตอบ Claude

- **ภาษาไทย** เป็นหลัก, technical terms ภาษาอังกฤษได้
- **กระชับ** — ตอบตรงประเด็น ไม่ยาวเกินจำเป็น
- **ใช้ตาราง** เมื่อมีข้อมูลเปรียบเทียบหรือ checklist
- **emoji ใช้สื่อความหมาย** ไม่เกินจำเป็น (sale 🔥, bundle 🎁, flash ⚡, preorder 📦, OK ✓, ผิด ✗)
- **ไม่ใช้สีชมพูเป็นหลัก** ในงาน design ของ Priao
- **บอก trade-off** — ทุก solution มี pros/cons เสมอ
- **ขอยืนยัน** ก่อน destructive changes (เช่น overwrite ไฟล์ใหญ่, ลบ data)

---

## 🚀 Phases ของโปรเจกต์ (Roadmap)

- **Phase 1** ✅ Modular structure + Flex card + PC fallback + promo card
- **Phase 2** ⏳ ERP integration (real-time data sync) — ต้องมี backend
- **Phase 3** ⏳ Design refresh — รอ user ศึกษา Claude Design

**กฎ:** ทำ Phase 1 ให้นิ่งก่อนข้าม Phase 2

---

## 📞 ต้องถามทุกครั้ง

ก่อนทำสิ่งเหล่านี้ ต้องถาม user ก่อน:

1. แก้/เพิ่ม column ใน Excel template (กระทบทั้งระบบ)
2. เปลี่ยน JSON format (กระทบ backward compat)
3. เพิ่ม dependency ใหม่ (CDN library)
4. เปลี่ยน LIFF ID หรือ LINE OA URL
5. ลบไฟล์/folder ใน repo
6. Push สิ่งใหญ่ (ทำให้ user push ผิดที่ไม่ได้)

---

## 📝 Changelog (อัปเดตเมื่อมีการแก้สำคัญ)

- 2026-05-27 ── แยก index.html 5.4 MB → modular structure
- 2026-05-28 ── สร้าง back-office converter (Excel ↔ JSON)
- 2026-06-09 ── เพิ่ม Flex card 2-button copy + PC fallback + copy.html
- 2026-06-09 ── เพิ่ม promo card (sale/bundle/flash/preorder)
- 2026-06-09 ── สร้าง CLAUDE.md กฎเหล็ก
