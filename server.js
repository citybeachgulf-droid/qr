const express = require('express');
const app = express();
const port = 3000;

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

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
