const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const B2 = require('backblaze-b2');
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

// إعداد Backblaze B2
const b2KeyId = process.env.B2_APPLICATION_KEY_ID || process.env.B2_KEY_ID;
const b2AppKey = process.env.B2_APPLICATION_KEY || process.env.B2_APP_KEY;
const b2BucketIdEnv = process.env.B2_BUCKET_ID || '';
const b2BucketNameEnv = process.env.B2_BUCKET_NAME || '';
const b2PublicBaseOverride = process.env.B2_PUBLIC_BASE_URL || '';

let b2; // instance
let b2Config = { enabled: false, bucketId: '', bucketName: '', publicBaseUrl: '' };
let b2InitPromise = null;

async function ensureB2Ready(){
  if (b2InitPromise) return b2InitPromise;
  b2InitPromise = (async () => {
    // إذا لم تتوفر بيانات الاعتماد، اعتبر B2 غير مفعّل
    if (!b2KeyId || !b2AppKey || (!b2BucketIdEnv && !b2BucketNameEnv)) {
      b2Config.enabled = false;
      return b2Config;
    }
    b2 = new B2({ applicationKeyId: b2KeyId, applicationKey: b2AppKey });
    const auth = await b2.authorize();
    const downloadUrl = auth && auth.data && auth.data.downloadUrl ? auth.data.downloadUrl : '';

    let bucketId = b2BucketIdEnv;
    let bucketName = b2BucketNameEnv;
    if (!bucketId || !bucketName) {
      const list = await b2.listBuckets({ accountId: auth.data.accountId });
      const buckets = (list && list.data && list.data.buckets) || [];
      let found;
      if (bucketId) {
        found = buckets.find(b => b.bucketId === bucketId);
      } else if (bucketName) {
        found = buckets.find(b => b.bucketName === bucketName);
      }
      if (!found) throw new Error('B2 bucket غير موجود. تحقق من B2_BUCKET_ID/B2_BUCKET_NAME');
      bucketId = found.bucketId;
      bucketName = found.bucketName;
    }

    const publicBaseUrl = b2PublicBaseOverride || downloadUrl;
    b2Config = { enabled: true, bucketId, bucketName, publicBaseUrl };
    return b2Config;
  })().catch(err => {
    console.error('B2 init error:', err && err.message ? err.message : err);
    b2Config.enabled = false;
    return b2Config;
  });
  return b2InitPromise;
}

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
              <p><a href="/file?hash=${hash}" target="_blank">📄 عرض الملف</a></p>
              ${report.fileUrl ? `<p><a href="${report.fileUrl}" target="_blank">🌐 Backblaze B2</a></p>` : ''}`);
  } else {
    res.send(`<h2>❌ هذا التقرير غير أصلي أو تم التعديل</h2>`);
  }
});

// مسار التهيئة/الإعداد للعميل
app.get('/config', async (req, res) => {
  const cfg = await ensureB2Ready();
  res.json({
    b2Enabled: !!cfg.enabled,
    b2BucketName: cfg.bucketName || '',
    b2PublicBaseUrl: cfg.publicBaseUrl || ''
  });
});

// مسار رفع الملف الكامل
// expects multipart/form-data with field name "file" and optional "hash" and "targetName"
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: 'لم يتم إرسال ملف' });
    }

    const providedHash = req.body && req.body.hash ? String(req.body.hash) : undefined;
    const savedFileName = req.file.filename;
    const targetName = req.body && req.body.targetName ? String(req.body.targetName) : savedFileName;

    // اختياري: سجل الملف في قاعدة البيانات المؤقتة باستخدام الهاش
    if (providedHash) {
      reports[providedHash] = { fileName: savedFileName, status: 'أصلي' };
    }

    // محاولة رفع الملف إلى B2 إن كان مفعّلًا
    let fileUrl;
    const cfg = await ensureB2Ready();
    if (cfg.enabled) {
      try {
        // احصل على عنوان الرفع
        const uploadUrlResp = await b2.getUploadUrl({ bucketId: cfg.bucketId });
        const uploadUrl = uploadUrlResp.data.uploadUrl;
        const uploadAuthToken = uploadUrlResp.data.authorizationToken;
        const fullPath = path.join(uploadsDirPath, savedFileName);
        const body = fs.readFileSync(fullPath);
        await b2.uploadFile({
          uploadUrl,
          uploadAuthToken,
          fileName: targetName,
          data: body,
          mime: 'application/pdf'
        });
        fileUrl = `${cfg.publicBaseUrl}/file/${cfg.bucketName}/${targetName}`;
        if (providedHash && reports[providedHash]) {
          reports[providedHash].b2Name = targetName;
          reports[providedHash].fileUrl = fileUrl;
        }
      } catch (e) {
        console.error('B2 upload error:', e && e.message ? e.message : e);
      }
    }

    return res.json({ ok: true, fileName: savedFileName, path: `/uploads/${savedFileName}`, fileUrl });
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
  if (report.fileUrl) {
    // إعادة توجيه إلى Backblaze إن وُجد رابط عام
    return res.redirect(302, report.fileUrl);
  }
  const filePath = path.join(uploadsDirPath, report.fileName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('❌ الملف غير موجود على الخادم');
  }
  res.setHeader('Content-Type', 'application/pdf');
  // inline العرض داخل المتصفح
  res.setHeader('Content-Disposition', `inline; filename="${report.fileName}"`);
  fs.createReadStream(filePath).pipe(res);
});

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
