const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
dotenv.config();
const app = express();
const port = 3000;

// Basic CORS for cross-origin requests
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// static files (serve index.html and assets)
app.use(express.static(__dirname));

// Backblaze B2 (S3-compatible) config
const b2Region = process.env.B2_REGION || 'us-west-000';
const b2Bucket = process.env.B2_BUCKET;
const b2Endpoint = process.env.B2_ENDPOINT || `https://s3.${b2Region}.backblazeb2.com`;
const s3Client = new S3Client({
  region: b2Region,
  endpoint: b2Endpoint,
  credentials: {
    accessKeyId: process.env.B2_KEY_ID || '',
    secretAccessKey: process.env.B2_APPLICATION_KEY || ''
  },
  forcePathStyle: String(process.env.B2_FORCE_PATH_STYLE || 'true').toLowerCase() === 'true'
});
const publicUrlBase = process.env.B2_PUBLIC_URL_BASE || `https://${b2Bucket}.s3.${b2Region}.backblazeb2.com`;

// Multer in-memory storage (we will upload to B2 directly)
const upload = multer({ storage: multer.memoryStorage() });

// قاعدة بيانات مؤقتة: ربط hash باسم الملف المرفوع
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
              <p>اسم الملف: ${report.fileName}</p>
              <p><a href="/file?hash=${hash}" target="_blank">📄 عرض الملف</a></p>`);
  } else {
    res.send(`<h2>❌ هذا التقرير غير أصلي أو تم التعديل</h2>`);
  }
});

// مسار رفع الملف الكامل إلى Backblaze B2 مباشرة
// expects multipart/form-data with field name "file" and optional "hash" and "fileName"
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'لم يتم إرسال ملف' });
    }
    if (!b2Bucket) {
      return res.status(500).json({ ok: false, message: 'B2_BUCKET غير مهيأ في المتغيرات' });
    }

    const providedHash = req.body && req.body.hash ? String(req.body.hash) : undefined;
    const originalName = (req.body && req.body.fileName ? String(req.body.fileName) : req.file.originalname) || 'file.pdf';
    const safeName = originalName.replace(/[^\w\-.]+/g, '_');
    const uniquePrefix = providedHash || String(Date.now());
    const objectKey = `${uniquePrefix}-${safeName}`;

    // رفع الملف إلى B2 عبر S3 API
    await s3Client.send(new PutObjectCommand({
      Bucket: b2Bucket,
      Key: objectKey,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || 'application/pdf'
    }));

    const publicUrl = `${publicUrlBase}/${objectKey}`;

    // اختياري: سجل الملف في قاعدة البيانات المؤقتة باستخدام الهاش
    if (providedHash) {
      reports[providedHash] = { fileName: safeName, key: objectKey, url: publicUrl, status: 'أصلي' };
    }

    return res.json({ ok: true, fileName: objectKey, url: publicUrl });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ ok: false, message: 'خطأ أثناء الرفع' });
  }
});

// مسار لعرض الملف كاملاً عند المسح (QR)
// مثال: /file?hash=abcdef
app.get('/file', (req, res) => {
  const hash = req.query.hash;
  if (!hash) {
    return res.status(400).send('❌ لا يوجد hash');
  }
  const report = reports[hash];
  if (!report) {
    return res.status(404).send('❌ لم يتم العثور على ملف مرتبط بهذا الهاش');
  }
  // إن وُجد رابط مباشر على Backblaze فأعد التوجيه إليه
  if (report.url) {
    return res.redirect(302, report.url);
  }
  // توافق للخلف: إذا كان الملف محفوظًا محليًا قديمًا
  const uploadsDirPath = path.join(__dirname, 'uploads');
  const filePath = path.join(uploadsDirPath, report.fileName);
  if (fs.existsSync(filePath)) {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${report.fileName}"`);
    return fs.createReadStream(filePath).pipe(res);
  }
  return res.status(404).send('❌ الملف غير موجود');
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
