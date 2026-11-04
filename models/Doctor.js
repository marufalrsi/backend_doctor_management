const mongoose = require("mongoose");
const { bangladeshPhoneOptions } = require("../utils/bangladesh");

const doctorSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true, maxlength: 24, validate: bangladeshPhoneOptions },
    registrationNumber: { type: String, trim: true, maxlength: 40 },
    specialty: { type: String, required: true, trim: true, maxlength: 100 },
    department: { type: String, trim: true, maxlength: 100 },
    subSpecialty: { type: String, trim: true, maxlength: 120 },
    degree: { type: String, trim: true, maxlength: 180 },
    hospital: { type: String, trim: true, maxlength: 200 },
    licenseNumber: { type: String, trim: true, maxlength: 60 },
    dutyStatus: { type: String, enum: ["active", "on-call", "in-surgery", "off-duty"], default: "active" },
    boardCertification: { type: String, trim: true, maxlength: 120 },
    maxPatientCensus: { type: Number, min: 0, max: 1000 },
    onCallRotation: { type: String, trim: true, maxlength: 120 },
    pager: { type: String, trim: true, maxlength: 40 },
    imageFilename: { type: String, default: null },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    isDemo: { type: Boolean, default: false, select: false },
  },
  {
    timestamps: true,
    toObject: {
      virtuals: true,
      transform: (doc, value) => {
        delete value.imageFilename;
        return value;
      },
    },
    toJSON: {
      virtuals: true,
      transform: (doc, value) => {
        delete value.imageFilename;
        return value;
      },
    },
  }
);

doctorSchema.virtual("imageUrl").get(function getImageUrl() {
  return this.imageFilename ? `/doctors/${this._id}/image` : null;
});

doctorSchema.index({ owner: 1, createdAt: -1, _id: -1 });
doctorSchema.index({ owner: 1, specialty: 1 });
doctorSchema.index({ owner: 1, hospital: 1 });
doctorSchema.index({ isDemo: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model("Doctor", doctorSchema);
