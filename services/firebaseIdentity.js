const requireVerifiedIdentity = (identity) => {
  if (
    typeof identity.email !== "string" ||
    typeof identity.uid !== "string" ||
    identity.email_verified !== true
  ) {
    const error = new Error("Verify your email address before signing in.");
    error.status = 403;
    throw error;
  }

  return {
    email: identity.email.trim().toLowerCase(),
    firebaseUid: identity.uid,
  };
};

module.exports = { requireVerifiedIdentity };
