const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const mongoose = require("mongoose");
const authRoutes = require("./routes/auth");
const resourceRoutes = require("./routes/resources");
const dashboardRoutes = require("./routes/dashboard");
const requireDatabase = require("./middleware/requireDatabase");
const requireSameOrigin = require("./middleware/requireSameOrigin");

if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32) {
  throw new Error("JWT_SECRET must be configured with at least 32 characters.");
}

const app = express();
const allowedOrigin = process.env.CLIENT_URL || "http://localhost:3000";

app.disable("x-powered-by");
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || origin === allowedOrigin) return callback(null, true);
      return callback(new Error("This request must come from the configured application."));
    },
    credentials: true,
  })
);
app.use(express.json({ limit: "50kb" }));
app.use(cookieParser());
app.use("/api", requireSameOrigin);

app.get("/api/health", (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  return res.status(connected ? 200 : 503).json({
    success: connected,
    status: connected ? "ready" : "database_unavailable",
    database: connected ? "connected" : "disconnected",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api", requireDatabase);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", resourceRoutes);

app.use("/api", (req, res) => {
  return res.status(404).json({ success: false, message: "API endpoint not found." });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const requestError = error instanceof Error ? error : new Error("An unexpected server error occurred.");
  const message = requestError.message;

  if (requestError.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "The request body must be valid JSON." });
  }
  if (requestError.type === "entity.too.large") {
    return res.status(413).json({ success: false, message: "The request body is too large." });
  }
  if (requestError.name === "MulterError") {
    const status = requestError.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    const message = requestError.code === "LIMIT_FILE_SIZE"
      ? "The image must be 5 MB or smaller."
      : "Upload one image file using the image field.";
    return res.status(status).json({ success: false, message });
  }
  if (requestError.name === "ValidationError" || requestError.name === "CastError") {
    return res.status(400).json({ success: false, message: "The submitted data is invalid." });
  }
  if (
    requestError.name === "MongoServerSelectionError" ||
    requestError.name === "MongoNetworkError" ||
    requestError.name === "MongooseServerSelectionError" ||
    message.startsWith("querySrv ")
  ) {
    console.error("MongoDB request failed:", message);
    return res.status(503).json({
      success: false,
      message: "The database is temporarily unavailable. Check the backend connection to MongoDB.",
    });
  }
  if (requestError.code === 11000) {
    return res.status(409).json({ success: false, message: "A record with that unique value already exists." });
  }
  if (message === "This request must come from the configured application.") {
    return res.status(403).json({ success: false, message });
  }

  console.error("Request failed:", message);
  const status = Number.isInteger(requestError.status) && requestError.status >= 400 && requestError.status < 500
    ? requestError.status
    : 500;
  return res.status(status).json({
    success: false,
    message: status < 500 ? message : "An unexpected server error occurred.",
  });
});

module.exports = app;
