const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const express = require("express");
const multer = require("multer");
const mongoose = require("mongoose");
const Doctor = require("../models/Doctor");
const {
  doctorImageDirectory,
  doctorImagePath,
  identifyDoctorImage,
  removeDoctorImage,
} = require("../utils/doctorImage");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
      return callback(null, true);
    }
    const error = new Error("Choose a JPEG, PNG, or WebP image.");
    error.status = 400;
    return callback(error);
  },
});

const visibleFilter = (req) => req.user.isAdmin
  ? { $or: [{ owner: req.user._id }, { isDemo: true }] }
  : { owner: req.user._id };
const findAccessibleDoctor = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return Doctor.findOne({ _id: req.params.id, ...visibleFilter(req) });
};

router.get("/:id/image", async (req, res, next) => {
  try {
    const doctor = await findAccessibleDoctor(req);
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found." });
    if (!doctor.imageFilename) {
      return res.status(404).json({ success: false, message: "This doctor has no profile image." });
    }
    const image = identifyDoctorImage(await fs.readFile(doctorImagePath(doctor.imageFilename)));
    if (!image) throw new Error("The stored doctor image is invalid.");
    res.set({
      "Cache-Control": "private, no-store",
      "Content-Type": image.contentType,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
    });
    return res.sendFile(doctorImagePath(doctor.imageFilename), (error) => {
      if (error && !res.headersSent) next(error);
    });
  } catch (error) {
    if (error.code === "ENOENT") {
      error.status = 404;
      error.message = "This doctor image is unavailable.";
    }
    return next(error);
  }
});

router.post("/:id/image", (req, res, next) => {
  upload.single("image")(req, res, (uploadError) => {
    if (uploadError) return next(uploadError);
    return next();
  });
}, async (req, res, next) => {
  let newFilename;
  let saved = false;
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid doctor ID." });
    }
    if (!req.file) {
      return res.status(400).json({ success: false, message: "Choose an image to upload." });
    }
    const image = identifyDoctorImage(req.file.buffer);
    if (!image) {
      return res.status(400).json({ success: false, message: "The image contents must be a valid JPEG, PNG, or WebP file." });
    }
    const doctor = await Doctor.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found or is read-only." });

    await fs.mkdir(doctorImageDirectory, { recursive: true });
    newFilename = `${crypto.randomUUID()}${image.extension}`;
    await fs.writeFile(doctorImagePath(newFilename), req.file.buffer, { flag: "wx" });
    const oldFilename = doctor.imageFilename;
    doctor.imageFilename = newFilename;
    await doctor.save();
    saved = true;
    await removeDoctorImage(oldFilename);

    return res.json({
      success: true,
      data: { imageUrl: `/doctors/${doctor._id}/image` },
    });
  } catch (error) {
    if (newFilename && !saved) {
      try {
        await removeDoctorImage(newFilename);
      } catch (cleanupError) {
        console.error("Could not remove an incomplete doctor image upload:", cleanupError.message);
      }
    }
    return next(error);
  }
});

router.delete("/:id/image", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: "Invalid doctor ID." });
    }
    const doctor = await Doctor.findOne({ _id: req.params.id, owner: req.user._id });
    if (!doctor) return res.status(404).json({ success: false, message: "Doctor not found or is read-only." });
    const oldFilename = doctor.imageFilename;
    if (!oldFilename) return res.json({ success: true, data: { imageUrl: null } });

    doctor.imageFilename = null;
    await doctor.save();
    await removeDoctorImage(oldFilename);
    return res.json({ success: true, data: { imageUrl: null } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
