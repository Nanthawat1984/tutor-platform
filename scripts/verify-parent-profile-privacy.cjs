const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function read(...parts) {
  const filePath = path.join(__dirname, '..', ...parts);
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

const profilePage = read('src', 'app', '(parent)', 'my-profile', 'page.tsx');
const userTypes = read('src', 'types', 'firestore.ts');
const storageRules = read('storage.rules');
const uploader = read('src', 'components', 'parent', 'parent-id-card-uploader.tsx');

assert.match(profilePage, /name="address"/);
assert.match(profilePage, /ParentIdCardUploader/);
assert.match(uploader, /name="id_card_path"/);
assert.match(userTypes, /address\?: string/);
assert.match(userTypes, /idCardPath\?: string/);
assert.match(storageRules, /match \/parent-kyc\/{uid}\/{fileName}/);
assert.match(storageRules, /request\.auth\.uid == uid/);
assert.match(storageRules, /allow delete: if isAuth\(\) && request\.auth\.uid == uid/);
assert.doesNotMatch(uploader, /getDownloadURL/);

console.log('Parent profile privacy check passed');
