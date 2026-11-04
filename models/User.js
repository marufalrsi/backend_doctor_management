const mongoose = require("mongoose");
const { bangladeshPhoneOptions } = require("../utils/bangladesh");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    designation: { type: String, trim: true, maxlength: 100 },
    phone: { type: String, trim: true, maxlength: 24, validate: bangladeshPhoneOptions },
    hospitalFacility: { type: String, trim: true, maxlength: 150 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    password: { type: String, select: false },
    firebaseUid: { type: String, unique: true, sparse: true },
    emailVerified: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
