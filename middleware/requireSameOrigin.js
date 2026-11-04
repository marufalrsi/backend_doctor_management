const requireSameOrigin = (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  const expectedOrigin = process.env.CLIENT_URL || "http://localhost:3000";
  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");

  if ((origin && origin !== expectedOrigin) || fetchSite === "cross-site") {
    return res.status(403).json({
      success: false,
      message: "This request must come from the configured application.",
    });
  }

  return next();
};

module.exports = requireSameOrigin;
