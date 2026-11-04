const mongoose = require("mongoose");

const requireDatabase = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({
      success: false,
      message: "The database is unavailable. Check the backend connection to MongoDB Atlas.",
    });
  }
  return next();
};

module.exports = requireDatabase;
