const mongoose = require("mongoose");
const createResourceRouter = require("../controllers/createResourceRouter");
const requireAuth = require("../middleware/auth").requireAuth;
const doctorImages = require("./doctorImages");
const Doctor = require("../models/Doctor");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");
const { removeDoctorImage } = require("../utils/doctorImage");
const { buildTokenSearchFilter } = require("../utils/tokenSearch");

const requireOwned = async (Model, id, owner, label) => {
  if (!mongoose.isValidObjectId(id)) {
    const error = new Error(`Choose a valid ${label}.`);
    error.status = 400;
    throw error;
  }
  const record = await Model.exists({ _id: id, owner });
  if (!record) {
    const error = new Error(`The selected ${label} was not found.`);
    error.status = 400;
    throw error;
  }
};

const doctors = createResourceRouter({
  Model: Doctor,
  facets: ["specialty", "hospital"],
  queryFilters: ["specialty", "hospital", "status", "dutyStatus"],
  fields: [
    "name",
    "email",
    "phone",
    "registrationNumber",
    "specialty",
    "department",
    "subSpecialty",
    "degree",
    "hospital",
    "licenseNumber",
    "dutyStatus",
    "boardCertification",
    "maxPatientCensus",
    "onCallRotation",
    "pager",
    "status",
  ],
  searchFields: [
    "name",
    "email",
    "phone",
    "registrationNumber",
    "specialty",
    "department",
    "subSpecialty",
    "degree",
    "hospital",
    "licenseNumber",
    "dutyStatus",
    "boardCertification",
    "onCallRotation",
    "pager",
  ],
  beforeDelete: async (id, owner) => {
    const [patients, appointments] = await Promise.all([
      Patient.exists({ owner, doctor: id }),
      Appointment.exists({ owner, doctor: id }),
    ]);
    if (patients || appointments) {
      const error = new Error("Reassign this doctor's patients and appointments before deleting the record.");
      error.status = 409;
      throw error;
    }
  },
  afterDelete: async (record) => {
    await removeDoctorImage(record.imageFilename);
  },
});

const patients = createResourceRouter({
  Model: Patient,
  queryFilters: ["acuity", "admissionStatus", "doctor"],
  dateFilterField: "admittedAt",
  resolveSearch: async ({ tokens, req }) => {
    const ownerFilter = req.user.isAdmin
      ? { $or: [{ owner: req.user._id }, { isDemo: true }] }
      : { owner: req.user._id };
    const doctors = await Doctor.find({
      $and: [ownerFilter, buildTokenSearchFilter(["name", "specialty"], tokens)],
    }).distinct("_id");
    return [{ doctor: { $in: doctors } }];
  },
  fields: [
    "medicalRecordNumber",
    "firstName",
    "lastName",
    "age",
    "dateOfBirth",
    "gender",
    "condition",
    "secondaryConditions",
    "allergies",
    "room",
    "department",
    "acuity",
    "admissionStatus",
    "admittedAt",
    "ivAccessConfirmed",
    "telemetryActive",
    "npoOrders",
    "doctor",
    "contactName",
    "contactPhone",
  ],
  searchFields: [
    "medicalRecordNumber",
    "firstName",
    "lastName",
    "condition",
    "secondaryConditions",
    "allergies",
    "room",
    "department",
    "gender",
    "acuity",
    "admissionStatus",
    "contactName",
    "contactPhone",
  ],
  populate: [{ path: "doctor", select: "name specialty" }],
  validateRelations: async (data, owner) => {
    if (data.doctor) await requireOwned(Doctor, data.doctor, owner, "doctor");
  },
  beforeDelete: async (id, owner) => {
    if (await Appointment.exists({ owner, patient: id })) {
      const error = new Error("Cancel or remove this patient's appointments before deleting the record.");
      error.status = 409;
      throw error;
    }
  },
});

const appointments = createResourceRouter({
  Model: Appointment,
  dateFilterField: "startsAt",
  queryFilters: ["status"],
  fields: ["patient", "doctor", "startsAt", "type", "status", "notes"],
  searchFields: ["type", "status"],
  resolveSearch: async ({ tokens, req }) => {
    const [patients, doctors] = await Promise.all([
      Patient.find({
        $and: [
          { owner: req.user._id },
          buildTokenSearchFilter(["firstName", "lastName", "medicalRecordNumber"], tokens),
        ],
      }).distinct("_id"),
      Doctor.find({
        $and: [
          { owner: req.user._id },
          buildTokenSearchFilter(["name", "specialty"], tokens),
        ],
      }).distinct("_id"),
    ]);
    return [
      { patient: { $in: patients } },
      { doctor: { $in: doctors } },
    ];
  },
  populate: [
    { path: "patient", select: "firstName lastName medicalRecordNumber" },
    { path: "doctor", select: "name specialty" },
  ],
  validateRelations: async (data, owner) => {
    if (data.patient) await requireOwned(Patient, data.patient, owner, "patient");
    if (data.doctor) await requireOwned(Doctor, data.doctor, owner, "doctor");
  },
});

const router = require("express").Router();
router.use(requireAuth);
router.use("/doctors", doctorImages);
router.use("/doctors", doctors);
router.use("/patients", patients);
router.use("/appointments", appointments);

module.exports = router;
