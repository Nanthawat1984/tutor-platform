export function getFirebaseAdminEnv(env: NodeJS.ProcessEnv = process.env) {
  const projectId = env.ADMIN_FIREBASE_PROJECT_ID || env.FIREBASE_PROJECT_ID;
  const clientEmail = env.ADMIN_FIREBASE_CLIENT_EMAIL || env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (env.ADMIN_FIREBASE_PRIVATE_KEY || env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n');

  return {
    projectId,
    clientEmail,
    privateKey,
  };
}
