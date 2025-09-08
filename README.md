# PDF Uploader with QR ("التقرير كامل")

## Run locally

```bash
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000
```

Open http://localhost:8000 and upload a PDF. The processed file will be available under `/files/...`.

## API

- POST `/upload-pdf`: multipart form field `file` (PDF). Returns JSON with `download_url`.
- GET `/files/{filename}`: serves processed PDFs.
- GET `/healthz`: health check.

## Commission API (عمولة الموظفين)

يعتمد حساب العمولة على الموظف الذي قام بجلب المعاملة (`brought_by_employee_id`). يتم تخزين البيانات داخل الذاكرة لغرض التجربة.

- POST `/employees`
  - body: `{ "name": "Ahmed", "commission_rate": 0.1 }`  (0.1 = 10%)
  - returns: created employee object

- GET `/employees`
  - returns: list of employees

- GET `/employees/{employee_id}`
  - returns: employee by id

- PATCH `/employees/{employee_id}`
  - body (optional fields): `{ "name": "New Name", "commission_rate": 0.15 }`
  - returns: updated employee

- POST `/transactions`
  - body: `{ "amount": 1000, "brought_by_employee_id": "<employee_id>", "note": "optional" }`
  - returns: created transaction

- GET `/transactions`
  - returns: list of transactions

- GET `/transactions/{transaction_id}`
  - returns: transaction by id

- GET `/transactions/{transaction_id}/commission`
  - returns: the transaction with computed `commission_amount` based on the employee who brought it

- GET `/employees/{employee_id}/commission-summary`
  - returns: totals for that employee (transactions count, total amount, total commission)

ملاحظة: يمكن تشغيل الخادم:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```


