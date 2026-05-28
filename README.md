# เปรียว คอสเมติกส์ — VIP Catalog

แคตตาล็อกสินค้าสำหรับลูกค้า VIP ของ บจ. เปรียว คอสเมติกส์ (จ.พิษณุโลก)
สร้างเป็น Static Site สำหรับ deploy บน **GitHub Pages**

---

## โครงสร้างโปรเจกต์

```
.
├── index.html              # หน้าหลัก (HTML skeleton ขนาดเบา ~23 KB)
├── css/
│   └── styles.css          # สไตล์ทั้งหมด
├── js/
│   └── app.js              # โค้ดทำงานของเว็บ (โหลด data + render)
├── data/
│   ├── index.json          # รายชื่อหมวดสินค้าที่จะโหลด
│   ├── C01.json            # ลิป (1,114 รายการ)
│   ├── C02.json            # หมวด C02 (876 รายการ)
│   ├── C03.json            # หมวด C03 (393 รายการ)
│   ├── C04.json            # หมวด C04 (687 รายการ)
│   ├── C05.json            # หมวด C05 (253 รายการ)
│   ├── C06.json            # หมวด C06 (267 รายการ)
│   ├── C07.json            # หมวด C07 (75 รายการ)
│   ├── C08.json            # หมวด C08 (162 รายการ)
│   └── C09.json            # หมวด C09 (161 รายการ)
└── assets/
    ├── logo.jpg            # โลโก้หลัก
    ├── categories/         # ไอคอนหมวด 9 ไฟล์ (C01-C09)
    └── brands/             # โลโก้แบรนด์ 55 ไฟล์
```

**สรุป:**

- ก่อนแยก: index.html ~5.4 MB ไฟล์เดียว
- หลังแยก: index.html ~23 KB + ไฟล์ย่อย รวมทั้งหมด ~3.5 MB (กระจาย cache ได้)

---

## วิธีรัน Local (Dev)

ไฟล์ใช้ `fetch()` โหลด JSON ต้องเสิร์ฟผ่าน HTTP — เปิดด้วย `file://` ไม่ได้

```bash
# Python (built-in)
python3 -m http.server 8000

# หรือ Node.js
npx serve .
```

แล้วเปิดเบราว์เซอร์ที่ `http://localhost:8000`

---

## วิธีอัปเดตข้อมูล

### 1. อัปเดตข้อมูลสินค้า (ราคา/สต๊อก/รายการใหม่)

แก้ไฟล์ `data/<หมวด>.json` ตรงๆ ได้เลย
รูปแบบแต่ละสินค้าเป็น array ตามลำดับ:

```json
[
  "barcode",
  "ชื่อสินค้า",
  "หมวดย่อย",
  "สถานะ (สินค้าขายดี / สินค้าหมดชั่วคราว / ...)",
  ราคา,
  จำนวนสต๊อก,
  "image_url",
  "BRAND_KEY",
  ขั้นต่ำต่อแพ็ค,
  "ข้อความ pack",
  flag
]
```

### 2. เพิ่ม/เปลี่ยนโลโก้แบรนด์

วางไฟล์ `.png` หรือ `.jpg` ลงใน `assets/brands/` ใช้ชื่อ key ตามที่อ้างถึงใน `data/*.json` (เช่น `CUTEPRESS.jpg`)
ถ้าต้องการให้แสดงเป็นโลโก้บนการ์ดสินค้า เพิ่ม entry ใน `js/app.js` ส่วน `const BRAND_LOGOS = {...}`

### 3. เปลี่ยนโลโก้หมวด

วาง `assets/categories/C01.jpg` (หรือ `.png`) ทับไฟล์เดิม

### 4. เปลี่ยน CSS / Logic

- สไตล์: แก้ `css/styles.css`
- โค้ดทำงาน: แก้ `js/app.js`

---

## วิธี Deploy GitHub Pages

```bash
# 1. สร้าง repo บน GitHub แล้ว clone หรือ init
git init
git add .
git commit -m "Initial: split monolithic HTML"
git branch -M main
git remote add origin https://github.com/<USER>/<REPO>.git
git push -u origin main

# 2. ไปที่ GitHub → Repo → Settings → Pages
#    Source: Deploy from a branch
#    Branch: main / (root)
#    Save

# 3. เว็บจะออนไลน์ที่ https://<USER>.github.io/<REPO>/
```

> **ระวัง:** ถ้า deploy ใต้ path ย่อย (เช่น `/<REPO>/`) ให้ใช้ relative path เสมอ (ทำแล้ว — ทุก src/href เป็น relative)

---

## Workflow แนะนำสำหรับอัปเดตข้อมูล

1. แก้เฉพาะไฟล์ `data/C0X.json` ที่ต้องการ — ไม่ต้องแตะ HTML/JS
2. ตรวจ JSON ด้วย `python3 -m json.tool data/C01.json > /dev/null` (ถ้า error คือ JSON พัง)
3. `git add data/C01.json && git commit -m "Update lip products" && git push`
4. GitHub Pages จะ rebuild ภายใน ~1 นาที

ข้อดี: diff ใน GitHub จะอ่านง่าย เห็นชัดว่าราคา/สต๊อกตัวไหนเปลี่ยน

---

## หมายเหตุทางเทคนิค

- ใช้ LINE LIFF SDK สำหรับ login (เปิดผ่าน LINE Application)
- ข้อมูลโหลดแบบ eager ตอน DOMContentLoaded (`loadCatalogData()` ใน `app.js`)
  - ถ้าอยาก lazy โหลดทีละหมวด ให้ย้าย fetch ไปไว้ใน `goCat()`
- รูปสินค้าใช้ external URL (Watsons, Shopee CDN ฯลฯ) — ไม่ได้เก็บเป็นไฟล์ใน repo

---

## ที่มา

แยกจาก `index.html` ต้นฉบับเป็นไฟล์ๆ ด้วย script `split_catalog.py` (เก็บไว้แยก ไม่อยู่ใน repo)
ไฟล์ต้นฉบับ backup ไว้ที่ `index.original.html.bak` (ใน working folder ของผู้ดูแล)
