const mongoose = require("mongoose");
const { bangladeshPhoneOptions } = require("../utils/bangladesh");

const patientSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    medicalRecordNumber: { type: String, required: true, trim: true, maxlength: 40 },
    firstName: { type: String, required: true, trim: true, maxlength: 80 },
    lastName: { type: String, required: true, trim: true, maxlength: 80 },
    age: { type: Number, min: 0, max: 125 },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: ["female", "male", "other", "unspecified"], default: "unspecified" },
    condition: { type: String, trim: true, maxlength: 300 },
    secondaryConditions: { type: String, trim: true, maxlength: 500 },
    allergies: { type: String, trim: true, maxlength: 300 },
    room: { type: String, trim: true, maxlength: 80 },
    department: { type: String, trim: true, maxlength: 100 },
    acuity: { type: String, enum: ["stable", "monitoring", "critical"], default: "stable" },
    admissionStatus: { type: String, enum: ["admitted", "discharge-pending", "discharged"], default: "admitted" },
    admittedAt: { type: Date },
    ivAccessConfirmed: { type: Boolean, default: false },
    telemetryActive: { type: Boolean, default: false },
    npoOrders: { type: Boolean, default: false },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor" },
    contactName: { type: String, trim: true, maxlength: 120 },
    contactPhone: { type: String, trim: true, maxlength: 24, validate: bangladeshPhoneOptions },
    isDemo: { type: Boolean, default: false, select: false },
  },
  { timestamps: true }
);

patientSchema.index({ owner: 1, medicalRecordNumber: 1 }, { unique: true });
patientSchema.index({ owner: 1, createdAt: -1, _id: -1 });
patientSchema.index({ owner: 1, doctor: 1, createdAt: -1, _id: -1 });
patientSchema.index({ owner: 1, admittedAt: 1 });
patientSchema.index({ owner: 1, acuity: 1, createdAt: -1, _id: -1 });
patientSchema.index({ owner: 1, admissionStatus: 1, createdAt: -1, _id: -1 });
patientSchema.index({ isDemo: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model("Patient", patientSchema);
