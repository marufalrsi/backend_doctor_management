require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const Doctor = require("./models/Doctor");
const Patient = require("./models/Patient");
const User = require("./models/User");

const doctorNames = [
  "Farhana Ahmed", "Tanvir Rahman", "Nusrat Jahan", "Mahmudul Hasan", "Samira Islam",
  "Shakib Hossain", "Ishrat Sultana", "Arif Chowdhury", "Maliha Karim", "Fahim Kabir",
  "Tasnim Akter", "Rashedul Alam", "Nabila Haque", "Sabbir Ahmed", "Meherun Nessa",
  "Imran Hossain", "Sadia Afrin", "Kamal Uddin", "Anika Bashar", "Nayeem Islam",
  "Rumana Akter", "Zubair Khan", "Sharmeen Sultana", "Ashfaq Rahman", "Sumaiya Noor",
  "Muntasir Mahmud", "Lamia Zaman", "Rafiq Hasan", "Tanjila Islam", "Omar Faruk",
];

const specialties = [
  "Cardiology", "Internal Medicine", "Pediatrics", "Neurology", "Dermatology",
  "Orthopedics", "Obstetrics and Gynecology", "Ophthalmology", "ENT", "Psychiatry",
];

const hospitals = [
  "Dhaka Medical College Hospital", "Square Hospital", "United Hospital",
  "Evercare Hospital Dhaka", "Bangladesh Medical University",
];

const degrees = [
  "MBBS, FCPS (Medicine)",
  "MBBS, MD (Internal Medicine)",
  "MBBS, FCPS (Pediatrics)",
  "MBBS, MD (Neurology)",
  "MBBS, DDV",
  "MBBS, MS (Orthopedics)",
  "MBBS, FCPS (Obstetrics and Gynecology)",
  "MBBS, MS (Ophthalmology)",
  "MBBS, DLO",
  "MBBS, FCPS (Psychiatry)",
];

const doctorRecords = doctorNames.map((name, index) => {
  const number = String(index + 1).padStart(2, "0");
  return {
    name: `Dr. ${name}`,
    email: `demo.doctor.${number}@example.test`,
    specialty: specialties[index % specialties.length],
    department: `${specialties[index % specialties.length]} Department`,
    subSpecialty: ["Heart failure", "Preventive care", "Pediatric care", "Stroke care"][index % 4],
    degree: degrees[index % degrees.length],
    hospital: hospitals[index % hospitals.length],
    licenseNumber: `BMDC-DEMO-${String(index + 1).padStart(4, "0")}`,
    registrationNumber: `REG-DEMO-${String(index + 1).padStart(4, "0")}`,
    dutyStatus: ["active", "on-call", "in-surgery", "off-duty"][index % 4],
    boardCertification: index % 3 === 0 ? "Board certified" : "Certification in progress",
    maxPatientCensus: 20 + (index % 11),
    onCallRotation: index % 2 === 0 ? "Weekday evenings" : "Weekend rotation",
    pager: `EXT-${String(200 + index)}`,
    status: index % 7 === 0 ? "inactive" : "active",
  };
});

const patientDetails = [
  ["Ayesha", "Rahman", 34, "female", "Hypertension", "None", "Ward 201", "monitoring"],
  ["Rafi", "Hossain", 8, "male", "Seasonal asthma", "Dust", "Pediatrics 104", "stable"],
  ["Nadia", "Akter", 57, "female", "Type 2 diabetes", "Penicillin", "Ward 305", "monitoring"],
  ["Hasan", "Mahmud", 46, "male", "Knee injury", "None", "Orthopedics 212", "stable"],
  ["Mim", "Sultana", 29, "female", "Migraine", "None", "Ward 108", "stable"],
  ["Sajid", "Karim", 63, "male", "Coronary artery disease", "Aspirin", "CCU 02", "critical"],
  ["Tania", "Islam", 41, "female", "Hypothyroidism", "None", "Ward 203", "stable"],
  ["Nabil", "Chowdhury", 15, "male", "Dengue fever", "None", "Pediatrics 109", "monitoring"],
  ["Shila", "Begum", 72, "female", "Chronic kidney disease", "Sulfa drugs", "Ward 401", "critical"],
  ["Fahad", "Ahmed", 38, "male", "Gastritis", "None", "Ward 116", "stable"],
  ["Jannat", "Haque", 24, "female", "Iron-deficiency anemia", "None", "Ward 205", "monitoring"],
  ["Morshed", "Alam", 51, "male", "Lower back pain", "None", "Orthopedics 218", "stable"],
  ["Sumaiya", "Noor", 6, "female", "Viral fever", "None", "Pediatrics 112", "stable"],
  ["Jubayer", "Hasan", 44, "male", "Pneumonia", "Penicillin", "Ward 310", "monitoring"],
  ["Farida", "Khatun", 66, "female", "Osteoarthritis", "None", "Ward 220", "stable"],
  ["Rayan", "Kabir", 31, "male", "Acute appendicitis", "None", "Surgery 307", "critical"],
  ["Nusrat", "Jahan", 53, "female", "Asthma", "Latex", "Ward 118", "monitoring"],
  ["Ashraf", "Uddin", 77, "male", "Arrhythmia", "None", "CCU 05", "critical"],
  ["Maliha", "Bashar", 19, "female", "Food-borne illness", "Peanuts", "Ward 107", "stable"],
  ["Shahriar", "Khan", 60, "male", "COPD", "None", "Ward 312", "monitoring"],
];

const patientRecords = patientDetails.map((details, index) => {
  const [firstName, lastName, age, gender, condition, allergies, room, acuity] = details;
  const number = String(index + 1).padStart(4, "0");
  return {
    medicalRecordNumber: `DEMO-MRN-${number}`,
    firstName,
    lastName,
    age,
    gender,
    condition,
    allergies,
    room,
    department: doctorRecords[index % doctorRecords.length].department,
    secondaryConditions: index % 2 === 0 ? "No additional conditions reported" : "Under clinical review",
    acuity,
    admissionStatus: index % 8 === 0 ? "discharge-pending" : "admitted",
    admittedAt: new Date(Date.now() - (index + 1) * 60 * 60 * 1000),
    ivAccessConfirmed: index % 2 === 0,
    telemetryActive: acuity !== "stable",
    npoOrders: index % 5 === 0,
    contactName: `${firstName} ${lastName} family`,
    doctorEmail: doctorRecords[index % doctorRecords.length].email,
  };
});

const main = async () => {
  const email = process.env.DEMO_USER_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error("Set DEMO_USER_EMAIL to the email address of the account to seed.");
  }

  await connectDB();
  const user = await User.findOne({ email }).select("_id email");
  if (!user) {
    throw new Error(`No account found for ${email}. Create an account before seeding demo data.`);
  }

  const doctorEmails = doctorRecords.map(({ email: doctorEmail }) => doctorEmail);
  const existingDoctors = await Doctor.find({
    owner: user._id,
    email: { $in: doctorEmails },
  }).select("email");
  const existingDoctorEmails = new Set(existingDoctors.map(({ email: doctorEmail }) => doctorEmail));
  const newDoctors = doctorRecords
    .filter(({ email: doctorEmail }) => !existingDoctorEmails.has(doctorEmail))
    .map((record) => ({ ...record, owner: user._id, isDemo: true }));
  if (newDoctors.length) await Doctor.insertMany(newDoctors);
  await Doctor.bulkWrite(doctorRecords.map((record) => ({
    updateOne: {
      filter: { owner: user._id, email: record.email },
      update: { $set: { ...record, isDemo: true } },
    },
  })));

  const doctors = await Doctor.find({
    owner: user._id,
    email: { $in: doctorEmails },
  }).select("_id email");
  const doctorIdsByEmail = new Map(doctors.map(({ _id, email: doctorEmail }) => [doctorEmail, _id]));
  const medicalRecordNumbers = patientRecords.map(({ medicalRecordNumber }) => medicalRecordNumber);
  const existingPatients = await Patient.find({
    owner: user._id,
    medicalRecordNumber: { $in: medicalRecordNumbers },
  }).select("medicalRecordNumber");
  const existingMedicalRecordNumbers = new Set(
    existingPatients.map(({ medicalRecordNumber }) => medicalRecordNumber)
  );
  const newPatients = patientRecords
    .filter(({ medicalRecordNumber }) => !existingMedicalRecordNumbers.has(medicalRecordNumber))
    .map(({ doctorEmail, ...record }) => ({
      ...record,
      owner: user._id,
      doctor: doctorIdsByEmail.get(doctorEmail),
      isDemo: true,
    }));
  if (newPatients.length) await Patient.insertMany(newPatients);
  const seedPatients = patientRecords.map(({ doctorEmail, ...record }) => ({
    ...record,
    owner: user._id,
    doctor: doctorIdsByEmail.get(doctorEmail),
    isDemo: true,
  }));
  await Patient.bulkWrite(seedPatients.map((record) => ({
    updateOne: {
      filter: { owner: user._id, medicalRecordNumber: record.medicalRecordNumber },
      update: { $set: record },
    },
  })));

  await User.updateOne({ _id: user._id }, { $set: { role: "admin" } });

  console.log(
    `Demo data for ${email}: added ${newDoctors.length} doctors and ${newPatients.length} patients ` +
    `(${doctorRecords.length} demo doctors and ${patientRecords.length} demo patients total).`
  );
};

main()
  .catch((error) => {
    console.error("Demo data seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
