# เปรียว คอสเมติกส์ — VIP Catalog

แคตตาล็อกสินค้าออนไลน์สำหรับลูกค้า VIP ของ บจ. เปรียว คอสเมติกส์ (จ.พิษณุโลก)
Static Site — Deploy บน **GitHub Pages**

🌐 **Live URL:** https://priaowhosale.github.io/Whosale_Catalogs/

---

## 📁 โครงสร้างโปรเจกต์

```
Whosale_Catalogs/
│
├── index.html                  (23 KB)     หน้าเว็บหลัก
├── README.md                               เอกสารนี้
├── .gitignore
│
├── css/
│   └── styles.css              (17 KB)     สไตล์ทั้งหมด
│
├── js/
│   └── app.js                 (101 KB)     โค้ดทำงาน — fetch JSON + render
│
├── data/                                   ข้อมูลสินค้า (เว็บโหลด runtime)
│   ├── index.json                          รายชื่อหมวด
│   ├── C01.json  (1,114 รายการ)            เครื่องสำอาง
│   ├── C02.json    (876 รายการ)            ผลิตภัณฑ์ดูแลผิวหน้า
│   ├── C03.json    (393 รายการ)            ผลิตภัณฑ์ดูแลผิวกาย
│   ├── C04.json    (687 รายการ)            ผลิตภัณฑ์ดูแลเส้นผม
│   ├── C05.json    (253 รายการ)            น้ำหอม
│   ├── C06.json    (267 รายการ)            อุปกรณ์เพื่อความงาม
│   ├── C07.json     (75 รายการ)            อาหารเสริม
│   ├── C08.json    (162 รายการ)            คอนซูเมอร์
│   └── C09.json    (161 รายการ)            แฟชั่น&ไลฟ์สไตล์
│
├── assets/                                 รูปภาพทั้งหมด
│   ├── logo.jpg                            โลโก้หลัก
│   ├── categories/                         9 ไอคอนหมวด (C01-C09)
│   └── brands/                             55 โลโก้แบรนด์
│
├── backoffice/                             🛠️ เครื่องมือหลังบ้าน (ไม่ deploy แต่อยู่ใน repo)
│   ├── converter.html                      ⭐ ลาก Excel → ดาวน์โหลด JSON
│   ├── convert.py                          CLI สำหรับ IT
│   └── README.md                           วิธีใช้
│
└── docs/                                   เอกสาร / screenshot
    └── screenshots/
```

**สรุปขนาด:** Repo รวม ~2.8 MB, 80+ ไฟล์
**ก่อนแยก:** index.html 5.4 MB ไฟล์เดียว

---

## 🚀 Workflow อัปเดตข้อมูล (สำหรับทีม)

### วิธีที่แนะนำ — ใช้ converter.html

1. ทีมแก้ Excel template `ไฟล์อัพโหลดสินค้าเข้า Catalog Wholesale_XXพ.ค.XX.xlsx`
2. ดับเบิ้ลคลิก `backoffice/converter.html` เปิดในเบราว์เซอร์
3. ลากไฟล์ Excel ลง → ดูจำนวน + คำเตือน
4. กด **"⬇ ดาวน์โหลดทั้งหมด (ZIP)"** → ได้ไฟล์ ZIP
5. แตก ZIP → ลาก `data/*.json` ขึ้น GitHub (drag-drop ทับของเดิม)
6. กรอก Commit message → กด Commit changes
7. รอ ~1 นาที → เว็บอัปเดตอัตโนมัติ

ดูรายละเอียดเพิ่มเติม → [`backoffice/README.md`](backoffice/README.md)

### วิธีแก้ตรง JSON (สำหรับ IT)

แก้ไฟล์ `data/C0X.json` ใน GitHub Web หรือ git command line ก็ได้ — เห็น diff ชัด

---

## 🧪 รันทดสอบ Local

ไฟล์ใช้ `fetch()` โหลด JSON ต้องเสิร์ฟผ่าน HTTP — เปิดด้วย `file://` ไม่ได้

```bash
# Python (built-in)
python -m http.server 8000

# หรือ Node.js
npx serve .
```

เปิด `http://localhost:8000`

---

## 📊 รูปแบบข้อมูลในไฟล์ JSON

แต่ละสินค้าเป็น array 11 elements ตามลำดับ:

```json
[
  "8850080754278",                      // [0] barcode
  "คิวท์เพรส ไฮยา ทินท์ ลิป...",        // [1] ชื่อสินค้า
  "ลิป",                                // [2] หมวดย่อย
  "สินค้าขายดี",                        // [3] tag/สถานะ (4 ค่า)
  43,                                   // [4] ราคา
  28,                                   // [5] stock
  "https://medias.watsons.co.th/...",   // [6] image URL
  "CUTEPRESS คิวท์เพรส",                // [7] brand key
  1,                                    // [8] pack_qty
  "1 / แท่ง",                           // [9] pack_label
  1                                     // [10] flag (1=A, 2=New, 3=B)
]
```

**Tag (สถานะ) 4 ค่า:** `"สินค้าขายดี"` | `"สินค้าหมดชั่วคราว"` | `"สินค้าใหม่"` | `""`

---

## 🚀 Deploy GitHub Pages

ตั้งค่าแล้วเรียบร้อย — `Settings → Pages → Source: main / (root)`
ทุกครั้งที่ push เข้า `main` → GitHub rebuild ภายใน ~1 นาที

```bash
# Push ปกติ
git add .
git commit -m "Update data"
git push origin main
```

---

## 🎨 การปรับแต่งหน้าเว็บ

| ต้องการ | แก้ไฟล์ |
|---|---|
| สี / font / layout | `css/styles.css` |
| Logic / interaction | `js/app.js` |
| โลโก้หลัก | `assets/logo.jpg` |
| ไอคอนหมวด | `assets/categories/CXX.jpg` |
| โลโก้แบรนด์ | `assets/brands/<BRAND_KEY>.png` หรือ `.jpg` |
| เพิ่ม brand logo ใน catalog detail | เพิ่ม entry ใน `js/app.js` ส่วน `BRAND_LOGOS = {}` |
| เปลี่ยนหมวดสินค้า | แก้ทั้ง `js/app.js`, `convert.py`, `converter.html` ให้ตรงกัน |

---

## ⚙️ เทคโนโลยี

- **Frontend:** Vanilla HTML/CSS/JS (ไม่มี framework)
- **LINE Login:** LIFF SDK (CDN: line-scdn.net)
- **Data:** Static JSON file (fetch แบบ async ตอน DOMContentLoaded)
- **Fonts:** Noto Sans Thai (Google Fonts)
- **Hosting:** GitHub Pages (static)
- **Converter (backoffice):** SheetJS + JSZip (browser), openpyxl (Python)

---

## 📜 ที่มาของโปรเจกต์

แยกออกมาจาก `index.html` ต้นฉบับ ~5.4 MB ไฟล์เดียว (มี base64 รูปฝัง + ข้อมูลสินค้าฝังใน JS) เป็นโครงสร้างแบบ modular เพื่อ:

- แก้ราคา/สต๊อก 1 รายการ git diff = 1 บรรทัด (ของเดิม = ทั้งไฟล์ 5.4 MB)
- Browser cache รูปและ JS แยก = โหลดเร็วครั้งที่ 2+
- ทีม non-IT แก้ผ่าน Excel ได้ → converter แปลงเป็น JSON

ดู [`docs/screenshots/`](docs/screenshots/) สำหรับ screenshot โครงสร้างไฟล์
