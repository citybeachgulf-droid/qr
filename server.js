const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const app = express();
const port = 3000;

// static files (serve index.html and assets)
app.use(express.static(__dirname));

// ensure uploads directory exists
const uploadsDirPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDirPath)) {
  fs.mkdirSync(uploadsDirPath, { recursive: true });
}

// Multer storage config to save the entire file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDirPath);
  },
  filename: function (req, file, cb) {
    // keep original filename or use provided name
    cb(null, file.originalname);
  }
});
const upload = multer({ storage });

// قاعدة بيانات مؤقتة
const reports = {
  "123abc": { fileName: "report1.pdf", status: "أصلي" }
};

// مسار التحقق
app.get('/verify', (req, res) => {
  const hash = req.query.hash;
  if(!hash) return res.send("❌ لا يوجد hash للتحقق");

  const report = reports[hash];
  if(report){
    res.send(`<h2>✅ التقرير أصلي</h2>
              <p>اسم الملف: ${report.fileName}</p>`);
  } else {
    res.send(`<h2>❌ هذا التقرير غير أصلي أو تم التعديل</h2>`);
  }
});

// مسار رفع الملف الكامل
// expects multipart/form-data with field name "file" and optional "hash" and "fileName"
app.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'لم يتم إرسال ملف' });
    }

    const providedHash = req.body && req.body.hash ? String(req.body.hash) : undefined;
    const savedFileName = req.file.filename;

    // اختياري: سجل الملف في قاعدة البيانات المؤقتة باستخدام الهاش
    if (providedHash) {
      reports[providedHash] = { fileName: savedFileName, status: 'أصلي' };
    }

    return res.json({ ok: true, fileName: savedFileName, path: `/uploads/${savedFileName}` });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ ok: false, message: 'خطأ أثناء الرفع' });
  }
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
