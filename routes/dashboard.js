const express = require("express");
const requireAuth = require("../middleware/auth").requireAuth;
const Doctor = require("../models/Doctor");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");

const TIME_ZONE = "Asia/Dhaka";
const getDhakaDayKey = (date) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const getDhakaDayStart = (dayKey) => {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - 6 * 60 * 60 * 1000);
};

const getDayKeys = (today) => {
  const todayStart = getDhakaDayStart(today);
  return Array.from({ length: 11 }, (_, index) => {
    const date = new Date(todayStart.getTime() - (10 - index) * 24 * 60 * 60 * 1000);
    return getDhakaDayKey(new Date(date.getTime() + 6 * 60 * 60 * 1000));
  });
};

const getDailyCounts = async (Model, filter, start, end) => {
  const rows = await Model.aggregate([
    { $match: { ...filter, createdAt: { $gte: start, $lt: end } } },
    {
      $group: {
        _id: { $dateToString: { date: "$createdAt", format: "%Y-%m-%d", timezone: TIME_ZONE } },
        count: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map(({ _id, count }) => [_id, count]));
};

const router = express.Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const owner = req.user._id;
    const visibleFilter = req.user.isAdmin
      ? { $or: [{ owner }, { isDemo: true }] }
      : { owner };
    const appointmentsFilter = { owner };
    const now = new Date();
    const todayKey = getDhakaDayKey(now);
    const dayKeys = getDayKeys(todayKey);
    const start = getDhakaDayStart(dayKeys[0]);
    const tomorrow = new Date(getDhakaDayStart(todayKey).getTime() + 24 * 60 * 60 * 1000);

    const [
      totalPatients,
      totalDoctors,
      activeDoctors,
      totalAppointments,
      appointmentsTodayCount,
      patientsByAcuity,
      patientsByAdmissionStatus,
      doctorsBySpecialty,
      patientsBySpecialty,
      dailyPatients,
      dailyDoctors,
      todaysAppointments,
    ] = await Promise.all([
      Patient.countDocuments(visibleFilter),
      Doctor.countDocuments(visibleFilter),
      Doctor.countDocuments({ ...visibleFilter, status: "active" }),
      Appointment.countDocuments(appointmentsFilter),
      Appointment.countDocuments({
        ...appointmentsFilter,
        status: "scheduled",
        startsAt: { $gte: getDhakaDayStart(todayKey), $lt: tomorrow },
      }),
      Patient.aggregate([
        { $match: visibleFilter },
        { $group: { _id: "$acuity", count: { $sum: 1 } } },
      ]),
      Patient.aggregate([
        { $match: visibleFilter },
        { $group: { _id: "$admissionStatus", count: { $sum: 1 } } },
      ]),
      Doctor.aggregate([
        { $match: { ...visibleFilter, status: "active" } },
        { $group: { _id: "$specialty", doctors: { $sum: 1 } } },
      ]),
      Patient.aggregate([
        { $match: visibleFilter },
        {
          $lookup: {
            from: Doctor.collection.name,
            let: { doctorId: "$doctor", recordOwner: "$owner" },
            pipeline: [
              { $match: { $expr: { $and: [{ $eq: ["$_id", "$$doctorId"] }, { $eq: ["$owner", "$$recordOwner"] }] } } },
              { $project: { specialty: 1 } },
            ],
            as: "assignedDoctor",
          },
        },
        {
          $group: {
            _id: { $ifNull: [{ $arrayElemAt: ["$assignedDoctor.specialty", 0] }, "Unassigned"] },
            patients: { $sum: 1 },
          },
        },
      ]),
      getDailyCounts(Patient, visibleFilter, start, tomorrow),
      getDailyCounts(Doctor, visibleFilter, start, tomorrow),
      Appointment.find({
        ...appointmentsFilter,
        status: "scheduled",
        startsAt: { $gte: getDhakaDayStart(todayKey), $lt: tomorrow },
      })
        .sort({ startsAt: 1 })
        .limit(8)
        .populate("patient", "firstName lastName medicalRecordNumber")
        .populate("doctor", "name specialty")
        .lean(),
    ]);

    const specialtyRows = new Map(
      doctorsBySpecialty.map(({ _id, doctors }) => [_id || "Unspecified", { specialty: _id || "Unspecified", doctors, patients: 0 }])
    );
    for (const { _id, patients } of patientsBySpecialty) {
      const specialty = _id || "Unassigned";
      const row = specialtyRows.get(specialty) || { specialty, doctors: 0, patients: 0 };
      row.patients = patients;
      specialtyRows.set(specialty, row);
    }

    return res.json({
      success: true,
      data: {
        generatedAt: now,
        timeZone: TIME_ZONE,
        metrics: {
          totalPatients,
          totalDoctors,
          activeDoctors,
          totalAppointments,
          appointmentsToday: appointmentsTodayCount,
          patientsPerActiveDoctor: activeDoctors ? totalPatients / activeDoctors : 0,
          registeredPatientsToday: dailyPatients.get(todayKey) || 0,
          registeredDoctorsToday: dailyDoctors.get(todayKey) || 0,
          patientsByAcuity: Object.fromEntries(patientsByAcuity.map(({ _id, count }) => [_id || "stable", count])),
          patientsByAdmissionStatus: Object.fromEntries(patientsByAdmissionStatus.map(({ _id, count }) => [_id || "admitted", count])),
        },
        specialties: Array.from(specialtyRows.values())
          .sort((a, b) => b.patients - a.patients || b.doctors - a.doctors)
          .slice(0, 8),
        trends: dayKeys.map((date) => ({
          date,
          patients: dailyPatients.get(date) || 0,
          doctors: dailyDoctors.get(date) || 0,
        })),
        todaysAppointments,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
