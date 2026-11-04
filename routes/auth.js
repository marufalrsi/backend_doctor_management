const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const { rateLimit } = require("express-rate-limit");
const User = require("../models/User");
const { AUTH_COOKIE, COOKIE_OPTIONS, requireAuth } = require("../middleware/auth");
const requireDatabase = require("../middleware/requireDatabase");
const { assertFirebaseAuthReady, verifyFirebaseIdToken } = require("../services/firebaseAdmin");
const { requireVerifiedIdentity } = require("../services/firebaseIdentity");
const { validateAdminRegistrationProfile } = require("../utils/adminRegistration");

const router = express.Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many sign-in attempts. Try again later." },
});

const issueSession = (user, res) => {
  const token = jwt.sign(
    { sub: user._id.toString(), admin: user.role === "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
  res.cookie(AUTH_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: 8 * 60 * 60 * 1000 });
  return res.json({
    success: true,
    data: {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        designation: user.designation,
        phone: user.phone,
        hospitalFacility: user.hospitalFacility,
      },
    },
  });
};

const safeEqual = (left, right) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const isRegistrationCodeConfigured = () => /^[0-9]{5}$/.test(process.env.REGISTRATION_CODE || "");

const validateRegistrationCode = (req, res, next) => {
  if (!isRegistrationCodeConfigured()) {
    return res.status(503).json({ success: false, message: "Account registration is not configured by the administrator." });
  }
  const { registrationCode } = req.body || {};
  if (
    typeof registrationCode !== "string" || !/^[0-9]{5}$/.test(registrationCode) ||
    !safeEqual(registrationCode, process.env.REGISTRATION_CODE)
  ) {
    return res.status(400).json({ success: false, message: "The admin security access key is incorrect." });
  }
  return next();
};

router.post("/registration-check", authLimiter, validateRegistrationCode, requireDatabase, async (req, res, next) => {
  try {
    assertFirebaseAuthReady();
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

router.post("/register", requireDatabase, authLimiter, async (req, res, next) => {
  try {
    const {
      idToken,
      name,
      designation,
      phone,
      hospitalFacility,
      authorizationConfirmed,
      registrationCode,
    } = req.body || {};
    if (!isRegistrationCodeConfigured()) {
      return res.status(503).json({ success: false, message: "Account registration is not configured by the administrator." });
    }
    const profileError = validateAdminRegistrationProfile({
      name,
      designation,
      phone,
      hospitalFacility,
      authorizationConfirmed,
    });
    if (profileError) {
      return res.status(400).json({ success: false, message: profileError });
    }
    if (typeof registrationCode !== "string" || !/^[0-9]{5}$/.test(registrationCode) ||
      !safeEqual(registrationCode, process.env.REGISTRATION_CODE)) {
      return res.status(400).json({
        success: false,
        message: "The admin security access key is incorrect.",
      });
    }
    const identity = await verifyFirebaseIdToken(idToken);
    if (typeof identity.email !== "string") {
      return res.status(400).json({ success: false, message: "The Firebase account must have an email address." });
    }
    const email = identity.email.trim().toLowerCase();
    let user = await User.findOne({ $or: [{ email }, { firebaseUid: identity.uid }] });
    if (user?.firebaseUid && user.firebaseUid !== identity.uid) {
      return res.status(409).json({ success: false, message: "That account is already linked to another sign-in." });
    }

    if (!user) {
      user = new User({ name: name.trim(), email, firebaseUid: identity.uid });
    } else {
      user.firebaseUid = identity.uid;
    }
    user.name = name.trim();
    user.designation = designation.trim();
    user.phone = phone.trim();
    user.hospitalFacility = hospitalFacility.trim();
    user.role = "admin";
    user.emailVerified = identity.email_verified === true;
    await user.save();

    return res.status(201).json({
      success: true,
      message: "Account created. Verify your email before signing in.",
      data: { email, emailVerified: user.emailVerified },
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/session", requireDatabase, authLimiter, async (req, res, next) => {
  try {
    const identity = requireVerifiedIdentity(await verifyFirebaseIdToken(req.body?.idToken));
    let user = await User.findOne({ firebaseUid: identity.firebaseUid });

    if (user && user.email !== identity.email) {
      return res.status(403).json({ success: false, message: "The verified email does not match this account." });
    }
    if (!user) {
      user = await User.findOne({ email: identity.email });
      if (!user) {
        return res.status(403).json({
          success: false,
          message: "No workspace account exists for this email. Register with your admin security access key.",
        });
      }
      if (user.firebaseUid && user.firebaseUid !== identity.firebaseUid) {
        return res.status(409).json({ success: false, message: "That account is already linked to another sign-in." });
      }
      user.firebaseUid = identity.firebaseUid;
    }

    user.emailVerified = true;
    await user.save();
    return issueSession(user, res);
  } catch (error) {
    return next(error);
  }
});

router.post("/logout", (req, res) => {
  res.clearCookie(AUTH_COOKIE, COOKIE_OPTIONS);
  return res.json({ success: true, message: "You have been signed out." });
});

router.get("/me", requireDatabase, requireAuth, (req, res) => {
  return res.json({
    success: true,
    data: {
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        designation: req.user.designation,
        phone: req.user.phone,
        hospitalFacility: req.user.hospitalFacility,
      },
    },
  });
});

module.exports = router;
