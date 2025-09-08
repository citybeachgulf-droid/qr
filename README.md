## Backblaze B2 setup

1) Create a Backblaze B2 Application Key with access to your target bucket.

2) Copy `.env.example` to `.env` and fill values:

```
B2_ACCOUNT_ID=your_key_id
B2_APPLICATION_KEY=your_application_key
# Provide at least one of these
B2_BUCKET_NAME=your_bucket_name
# or
B2_BUCKET_ID=your_bucket_id

# Optional override for public base URL (rarely needed)
# B2_PUBLIC_BASE_URL=https://f000.backblazeb2.com

PORT=3000
```

Notes
- If you only know the bucket name, the server will resolve its ID automatically after authorization.
- Fallback env names supported for compatibility: `B2_APPLICATION_KEY_ID`, `B2_KEY_ID`, `B2_APP_KEY`.

Run

```
npm install
node server.js
```

Test upload
- Open `http://localhost:3000/` and upload a file.
- If env is missing or invalid, the API returns: "خدمة التخزين غير مهيأة...". Ensure the `.env` is present and correct.

