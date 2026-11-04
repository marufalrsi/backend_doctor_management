const admin = require("firebase-admin");

const getFirebaseAuth = () => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    const error = new Error("Firebase Admin is not configured. Set FIREBASE_PROJECT_ID.");
    error.status = 503;
    throw error;
  }

  let app = admin.apps.find((item) => item.name === "doctor-tracker");
  if (!app) {
    try {
      let credential;
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      if (serviceAccountJson) {
        credential = admin.credential.cert(JSON.parse(serviceAccountJson));
      } else {
        credential = admin.credential.applicationDefault();
      }

      app = admin.initializeApp({ credential, projectId }, "doctor-tracker");
    } catch (error) {
      const configurationError = new Error(
        error instanceof SyntaxError
          ? "FIREBASE_SERVICE_ACCOUNT_JSON must contain valid service-account JSON."
          : `Firebase Admin could not initialize: ${error.message}`
      );
      configurationError.status = 503;
      throw configurationError;
    }
  }

  return admin.auth(app);
};

const assertFirebaseAuthReady = () => {
  try {
    getFirebaseAuth();
  } catch {
    const error = new Error("Firebase token verification is not configured. Set FIREBASE_PROJECT_ID on the backend.");
    error.status = 503;
    throw error;
  }
};

const verifyFirebaseIdToken = async (idToken) => {
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 10_000) {
    const error = new Error("A valid Firebase ID token is required.");
    error.status = 400;
    throw error;
  }

  const firebaseAuth = getFirebaseAuth();
  try {
    return await firebaseAuth.verifyIdToken(idToken);
  } catch (error) {
    if (error.code?.startsWith("auth/")) {
      const authError = new Error("Firebase could not verify this sign-in. Please sign in again.");
      authError.status = 401;
      throw authError;
    }
    if (error.status) throw error;
    const authError = new Error(
      "Firebase could not verify this account. Check the Firebase project ID and backend network connection."
    );
    authError.status = 503;
    throw authError;
  }
};

module.exports = { assertFirebaseAuthReady, verifyFirebaseIdToken };
