const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true },
    startsAt: { type: Date, required: true },
    type: { type: String, trim: true, maxlength: 100, default: "Consultation" },
    status: {
      type: String,
      enum: ["scheduled", "completed", "cancelled"],
      default: "scheduled",
      set: (value) => value == null || value === "" ? "scheduled" : value,
    },
    notes: { type: String, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

appointmentSchema.index({ owner: 1, createdAt: -1, _id: -1 });
appointmentSchema.index({ owner: 1, startsAt: 1 });
appointmentSchema.index({ owner: 1, status: 1, startsAt: 1 });
appointmentSchema.index({ owner: 1, patient: 1 });
appointmentSchema.index({ owner: 1, doctor: 1 });

module.exports = mongoose.model("Appointment", appointmentSchema);
