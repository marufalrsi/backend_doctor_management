const jwt = require("jsonwebtoken");
const User = require("../models/User");

const AUTH_COOKIE = "doctor_tracker_session";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies[AUTH_COOKIE];
    if (!token) {
      return res.status(401).json({ success: false, message: "Sign in to continue." });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select("name email role designation phone hospitalFacility");
    if (!user) {
      return res.status(401).json({ success: false, message: "Your session is no longer valid." });
    }

    req.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      designation: user.designation,
      phone: user.phone,
      hospitalFacility: user.hospitalFacility,
      isAdmin: user.role === "admin" && payload.admin === true,
    };
    return next();
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      return res.status(401).json({ success: false, message: "Your session has expired. Sign in again." });
    }
    return next(error);
  }
};

module.exports = { AUTH_COOKIE, COOKIE_OPTIONS, requireAuth };
