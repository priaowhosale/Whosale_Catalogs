# Back-office Tools — Priao VIP Catalog

เครื่องมือสำหรับอัปเดตข้อมูลสินค้าจาก Excel template ของทีม
เปลี่ยน Excel → JSON ที่เว็บใช้ ในขั้นตอนเดียว

---

## เครื่องมือใน folder นี้

| ไฟล์ | ใช้กับใคร | ต้องลงโปรแกรมไหม |
|---|---|---|
| **`converter.html`** | ทีม Merchandise / Sale / ใครก็ได้ | ไม่ต้อง — แค่เปิดในเบราว์เซอร์ |
| **`convert.py`** | ฝ่าย IT (มี Python) | ต้องมี Python 3 + `pip install openpyxl` |

ทั้งสองเครื่องมือใช้ mapping เหมือนกันเป๊ะ — แค่ต่างที่ interface

---

## วิธีใช้ converter.html (แนะนำสำหรับทีม)

### Workflow ปกติ

1. เปิดไฟล์ `backoffice/converter.html` ในเบราว์เซอร์ (ดับเบิ้ลคลิกได้เลย)
2. ลากไฟล์ `ไฟล์อัพโหลดสินค้าเข้า Catalog Wholesale_XXพ.ค.XX.xlsx` มาวาง
3. ระบบจะแสดง:
   - จำนวนรายการต่อหมวด
   - คำเตือนต่างๆ (เช่น barcode ซ้ำ, brand ใหม่)
   - รายชื่อ brand ทั้งหมดที่เจอ (ดูว่ามีรูปครบไหม)
4. กดปุ่ม **"⬇ ดาวน์โหลดทั้งหมด (ZIP)"** → จะได้ไฟล์ ZIP มี:
   - `data/C01.json` - `C09.json`
   - `data/index.json`
   - `conversion_report.md`
5. แตก ZIP → ลากเข้า GitHub `Whosale_Catalogs/data/` (เขียนทับ)
6. กรอก Commit message → กด Commit

> **ไม่ต้องเชื่อมเน็ตหลังเปิดหน้าเว็บแล้ว** — ไฟล์ HTML นี้ใช้ SheetJS + JSZip จาก CDN แต่จะ cache ไว้ในเบราว์เซอร์

### ขั้นสูง

- **ดาวน์โหลดเฉพาะหมวด:** ในตาราง คลิกลิงก์ `⬇ JSON` ของหมวดที่อยากอัป
- **ดู report ก่อนตัดสินใจ:** กด `📄 ดาวน์โหลด report.md`

---

## วิธีใช้ convert.py (สำหรับ IT)

### ติดตั้งครั้งแรก

```bash
pip install openpyxl
```

### แปลงไฟล์

```bash
cd backoffice
python convert.py "ไฟล์อัพโหลดสินค้าเข้า Catalog Wholesale_27พ.ค.69.xlsx"
```

ผลลัพธ์จะถูกเขียนลง `../data/CXX.json` (เขียนทับของเดิม) และสร้าง `../conversion_report.md`

### ระบุ output folder อื่น

```bash
python convert.py products.xlsx --out /tmp/test_data
```

### Options เต็ม

```bash
python convert.py -h
```

---

## โครงสร้าง Excel ที่รองรับ

Sheet เดียวชื่อ `สินค้าทั้งหมด` หรือ sheet แรกในไฟล์

| Col | Header | ตัวอย่าง | หมายเหตุ |
|---|---|---|---|
| 1 | หมวดสินค้า | เครื่องสำอาง | ต้องตรงกับ mapping (ดูด้านล่าง) |
| 2 | หมวดย่อยสินค้า | ลิป | free text |
| 3 | รหัสสินค้า | 8850080754278 | barcode/SKU — ห้ามว่าง, ห้ามซ้ำ |
| 4 | ชื่อสินค้า | ... | |
| 5 | จำนวน/หน่วย | 1 | ตัวเลข |
| 6 | หน่วย | แท่ง | free text (แต่ระวัง typo เช่น แพค vs แพ็ค) |
| 7 | แบรนด์ | CUTEPRESS คิวท์เพรส | ใช้ format: `ENGLISH ภาษาไทย` |
| 8 | PSaleStatus | A / B / New | ต้องเป็น 1 ใน 3 ค่านี้เท่านั้น |
| 9 | Tag | สินค้าขายดี / สินค้าหมดชั่วคราว / สินค้าใหม่ / ว่าง | |
| 10 | price_wholesale | 43 | ตัวเลข |
| 11 | OnStockFG | 28 | ตัวเลข (0 = หมด) |
| 12 | ลิงก์รูปภาพ | (hyperlink) | URL ต้องอยู่ใน **hyperlink ของ cell** ไม่ใช่ text |

**Row 1-3:** header — converter จะข้ามอัตโนมัติ
**Row 4 ขึ้นไป:** data
**Row ที่มีคำว่า "รวมทั้งหมด..." ใน col 1:** ถูกข้ามอัตโนมัติ

### Category mapping

| หมวดสินค้า (Excel) | → | File JSON |
|---|---|---|
| เครื่องสำอาง | → | `C01.json` |
| ผลิตภัณฑ์ดูแลผิวหน้า | → | `C02.json` |
| ผลิตภัณฑ์ดูแลผิวกาย | → | `C03.json` |
| ผลิตภัณฑ์ดูแลเส้นผม | → | `C04.json` |
| น้ำหอม | → | `C05.json` |
| อุปกรณ์เพื่อความงาม | → | `C06.json` |
| อาหารเสริม | → | `C07.json` |
| คอนซูเมอร์ | → | `C08.json` |
| แฟชั่น&ไลฟ์สไตล์ | → | `C09.json` |

ถ้าทีมเพิ่มหมวดใหม่ใน Excel → ต้องแก้ mapping ในทั้งสองไฟล์ (`convert.py` + `converter.html`) และเพิ่ม `assets/categories/CXX.jpg` + ไอคอนหมวดในหน้าเว็บ

---

## Business rules ที่ converter ทำให้อัตโนมัติ

1. **Auto-override Tag เมื่อ stock = 0**
   ถ้า `OnStockFG = 0` แต่ Tag ไม่ใช่ "สินค้าหมดชั่วคราว" → จะถูกแก้ให้เป็น "สินค้าหมดชั่วคราว" อัตโนมัติ (แจ้งใน report)

2. **PSaleStatus → flag**
   - `A` → `1` (สินค้าทั่วไป)
   - `New` → `2` (สินค้าใหม่)
   - `B` → `3` (Plan B / รอง)
   - ค่าอื่นๆ → `3` + แจ้งใน report

3. **ข้าม row subtotal/empty**
   row ที่ column "หมวดสินค้า" ว่างหรือมี "รวมทั้งหมด..." จะถูกข้าม

4. **barcode ซ้ำ**
   เก็บอันแรก + แจ้งใน report (ไม่ปิดโปรแกรม)

5. **ดึง URL จาก hyperlink**
   column "ลิงก์รูปภาพ" — converter อ่านจาก **hyperlink ของ cell** ไม่ใช่ text "📷 ดูรูป"

---

## Troubleshooting

### "ไม่เจอไฟล์ Excel" / "permission denied"
ปิดไฟล์ใน Excel ก่อนรัน converter (ระบบ Windows lock ไฟล์ที่เปิดอยู่)

### "Excel มี cell เปล่าๆ ไม่ใช่ subtotal แต่ขึ้นเตือน"
ตรวจสอบว่า column "หมวดสินค้า" ใส่ถูกหรือไม่ — converter ดูที่ column 1 เป็นหลัก

### "ภาพไม่ขึ้นในเว็บหลังอัป"
ตรวจสอบ:
1. URL ใน Excel cell เป็น hyperlink จริงๆ (ไม่ใช่แค่ text)
2. ลองคลิกที่ "📷 ดูรูป" ใน Excel ดูว่าเปิดรูปได้ไหม
3. URL ต้องไม่ block hotlinking (Watsons CDN, Shopee CDN ใช้ได้)

### "Brand บางตัวเป็นไอคอนตัวอักษร ไม่ใช่โลโก้"
แสดงว่ายังไม่มีไฟล์รูป brand ใน `assets/brands/`
- เพิ่มไฟล์: `assets/brands/<BRAND_KEY>.png` (key = คำแรกของ "แบรนด์" ใน Excel, ตัวพิมพ์ใหญ่)
- ถ้าอยากให้แสดงโลโก้ใน catalog detail ด้วย: เพิ่ม entry ใน `js/app.js` ตัวแปร `BRAND_LOGOS`

---

## Sync mapping ระหว่าง 2 ไฟล์

ถ้าแก้ไข `CATEGORY_MAP` หรือ `STATUS_FLAG_MAP` ต้องแก้ทั้ง 2 ที่ให้ตรงกัน:

- **convert.py:** บรรทัด ~24 (`CATEGORY_MAP = {...}`)
- **converter.html:** บรรทัด ~78 (`const CATEGORY_MAP = {...}`)

ไม่อย่างนั้นทีมแต่ละคนจะได้ผลลัพธ์ต่างกัน
