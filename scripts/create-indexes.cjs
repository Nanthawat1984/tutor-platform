// Create Firestore composite indexes directly via REST API (workaround for firebase-tools 15.13.0 deploy bug).
// Usage: node scripts/create-indexes.cjs
const path = require('path');
const https = require('https');
const admin = require('firebase-admin');

const KEY_FILE = path.join(__dirname, '..', 'tutor-platform-4e38f-firebase-adminsdk-fbsvc-9281253d65.json');
const PROJECT_ID = 'tutor-platform-4e38f';
const DATABASE_ID = 'tutor';

// Indexes to create: { collection, fields: [{fieldPath, order}] }
const INDEXES = [
  {
    collection: 'payments',
    fields: [
      { fieldPath: 'bookingId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
  {
    collection: 'payments',
    fields: [
      { fieldPath: 'bookingId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
  {
    collection: 'payments',
    fields: [
      { fieldPath: 'bookingId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
    ],
  },
  {
    collection: 'payments',
    fields: [
      { fieldPath: 'parentId', order: 'ASCENDING' },
      { fieldPath: 'createdAt', order: 'DESCENDING' },
    ],
  },
  {
    collection: 'payments',
    fields: [
      { fieldPath: 'teacherId', order: 'ASCENDING' },
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'paidAt', order: 'DESCENDING' },
    ],
  },
];

function request(method, url, token, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function main() {
  const app = admin.initializeApp({ credential: admin.credential.cert(KEY_FILE) });
  // Get an OAuth2 access token from the service account credential.
  const accessToken = await app.options.credential.getAccessToken();
  const token = accessToken.access_token;

  for (const idx of INDEXES) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${DATABASE_ID}/collectionGroups/${idx.collection}/indexes`;
    const body = {
      queryScope: 'COLLECTION',
      fields: idx.fields,
    };
    const res = await request('POST', url, token, body);
    if (res.status === 200 || res.status === 201) {
      console.log(`✅ Created index on ${idx.collection}: ${idx.fields.map((f) => `${f.fieldPath} ${f.order}`).join(', ')}`);
    } else if (res.status === 409) {
      console.log(`ℹ️ Index already exists on ${idx.collection}: ${idx.fields.map((f) => `${f.fieldPath} ${f.order}`).join(', ')}`);
    } else {
      console.log(`❌ Failed (${res.status}) on ${idx.collection}:`, JSON.stringify(res.body));
    }
  }

  await app.delete();
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});