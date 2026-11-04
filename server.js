const dotenv = require("dotenv");
dotenv.config();

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const app = require("./app");

const PORT = Number(process.env.PORT) || 5000;
const server = app.listen(PORT, () => {
  console.log(`REST API listening on port ${PORT}`);
  connectDB().catch((error) => {
    console.error("MongoDB connection failed:", error.message);
  });
});

const shutdown = async (signal) => {
  console.log(`${signal} received; closing server.`);
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
