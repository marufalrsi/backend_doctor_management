const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
process.env.JWT_SECRET = "unit-test-only-secret-that-is-not-used-in-production";
const mongoose = require("mongoose");
const Doctor = require("../models/Doctor");
const Patient = require("../models/Patient");
const Appointment = require("../models/Appointment");
const User = require("../models/User");
const { isBangladeshMobile } = require("../utils/bangladesh");
const { validateAdminRegistrationProfile } = require("../utils/adminRegistration");
const { assertFirebaseAuthReady } = require("../services/firebaseAdmin");
const { requireVerifiedIdentity } = require("../services/firebaseIdentity");
const { buildDateFilter } = require("../utils/dateFilter");
const { identifyDoctorImage } = require("../utils/doctorImage");
const { buildTokenSearchFilter } = require("../utils/tokenSearch");
const { parsePagination } = require("../utils/queryPagination");
const { parseSearch } = require("../utils/querySearch");
const app = require("../app");

let server;
let baseUrl;

before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("health reports database readiness accurately", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  const body = await response.json();

  if (mongoose.connection.readyState === 1) {
    assert.equal(response.status, 200);
    assert.equal(body.database, "connected");
  } else {
    assert.equal(response.status, 503);
    assert.equal(body.database, "disconnected");
    assert.equal(body.success, false);
  }
});

test("collection routes fail explicitly when MongoDB is unavailable", async () => {
  if (mongoose.connection.readyState === 1) return;
  const response = await fetch(`${baseUrl}/api/patients`);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.match(body.message, /database is unavailable/i);
});

test("Firebase session exchange reports a database outage instead of hanging", async () => {
  if (mongoose.connection.readyState === 1) return;
  const response = await fetch(`${baseUrl}/api/auth/session`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idToken: "test-firebase-id-token" }),
  });

  test("Firebase ID-token verification setup does not require service-account credentials", () => {
    const previousProject = process.env.FIREBASE_PROJECT_ID;
    const previousServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    process.env.FIREBASE_PROJECT_ID = "doctor-tracker-test";
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    try {
      assert.doesNotThrow(assertFirebaseAuthReady);
    } finally {
      if (previousProject === undefined) delete process.env.FIREBASE_PROJECT_ID;
      else process.env.FIREBASE_PROJECT_ID = previousProject;
      if (previousServiceAccount === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = previousServiceAccount;
    }
  });

  assert.equal(response.status, 503);
});

test("admin invitation key is validated before account registration", async () => {
  const previousCode = process.env.REGISTRATION_CODE;
  process.env.REGISTRATION_CODE = "12345";
  try {
    const accepted = await fetch(`${baseUrl}/api/auth/registration-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationCode: "12345" }),
    });
    assert.ok([200, 503].includes(accepted.status));
    if (accepted.status === 503) {
      const body = await accepted.json();
      assert.match(body.message, /database|firebase admin/i);
    }

    const rejected = await fetch(`${baseUrl}/api/auth/registration-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationCode: "incorrect-code" }),
    });
    assert.equal(rejected.status, 400);

    const invalidFormat = await fetch(`${baseUrl}/api/auth/registration-check`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ registrationCode: "1234" }),
    });
    assert.equal(invalidFormat.status, 400);
  } finally {
    if (previousCode === undefined) delete process.env.REGISTRATION_CODE;
    else process.env.REGISTRATION_CODE = previousCode;
  }
});

test("Bangladesh mobile numbers accept local and international formats", () => {
  assert.equal(isBangladeshMobile("01712345678"), true);
  assert.equal(isBangladeshMobile("+8801712345678"), true);
  assert.equal(isBangladeshMobile("019 1234 5678"), true);
  assert.equal(isBangladeshMobile("+1 555 0100"), false);
  assert.equal(isBangladeshMobile("01212345678"), false);
});

test("admin registration requires the complete authorized hospital profile", () => {
  const profile = {
    name: "Dr. Mahmudul Hasan",
    designation: "Chief Medical Officer",
    phone: "01712345678",
    hospitalFacility: "Dhaka Medical College Hospital",
    authorizationConfirmed: true,
  };
  assert.equal(validateAdminRegistrationProfile(profile), null);
  assert.match(validateAdminRegistrationProfile({ ...profile, phone: "+1 555 0100" }), /Bangladesh mobile/i);
  assert.match(validateAdminRegistrationProfile({ ...profile, authorizationConfirmed: false }), /authorized/i);
  assert.match(validateAdminRegistrationProfile({ ...profile, designation: "" }), /designation/i);
});

test("admission date filters use Bangladesh day boundaries", () => {
  const filter = buildDateFilter({ date: "2026-11-04" });
  assert.equal(filter.$gte.toISOString(), "2026-11-03T18:00:00.000Z");
  assert.equal(filter.$lt.toISOString(), "2026-11-04T18:00:00.000Z");
  const now = new Date("2026-11-04T06:35:15.000Z");
  const lastThreeDays = buildDateFilter({ range: "3d", now });
  assert.equal(lastThreeDays.$gte.toISOString(), "2026-11-01T06:35:15.000Z");
  assert.equal(lastThreeDays.$lt, now);
  assert.throws(() => buildDateFilter({ date: "2026-02-30" }), (error) => error.status === 400);
  assert.throws(() => buildDateFilter({ range: "30d" }), (error) => error.status === 400);
});

test("doctor schema stores names, qualifications and hospital affiliations", async () => {
  const doctor = new Doctor({
    owner: new mongoose.Types.ObjectId(),
    name: "Dr. Farhana Ahmed",
    specialty: "Cardiology",
    degree: "MBBS, FCPS (Medicine), MD",
    hospital: "Dhaka Medical College Hospital",
    phone: "+8801712345678",
  });

  await doctor.validate();
  assert.equal(doctor.name, "Dr. Farhana Ahmed");
  assert.equal(doctor.degree, "MBBS, FCPS (Medicine), MD");
  assert.equal(doctor.hospital, "Dhaka Medical College Hospital");
  assert.equal(doctor.isDemo, false);
  assert.equal(doctor.imageUrl, null);
  doctor.imageFilename = "123e4567-e89b-12d3-a456-426614174000.jpg";
  assert.equal(doctor.toObject().imageUrl, `/doctors/${doctor._id}/image`);
  assert.equal(doctor.toObject().imageFilename, undefined);
});

test("doctor profile images are identified from JPEG, PNG, and WebP signatures", () => {
  assert.deepEqual(identifyDoctorImage(Buffer.from([0xff, 0xd8, 0xff, 0x00])), {
    extension: ".jpg",
    contentType: "image/jpeg",
  });
  assert.deepEqual(identifyDoctorImage(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), {
    extension: ".png",
    contentType: "image/png",
  });
  assert.deepEqual(identifyDoctorImage(Buffer.from("RIFF0000WEBP")), {
    extension: ".webp",
    contentType: "image/webp",
  });
  assert.equal(identifyDoctorImage(Buffer.from("not an image")), null);
});

test("search terms match independently across multiple fields and escape regex characters", () => {
  const filter = buildTokenSearchFilter(["firstName", "lastName"], ["QA", "Patient.*"]);
  assert.equal(filter.$and.length, 2);
  assert.deepEqual(filter.$and[0].$or.map((match) => Object.keys(match)[0]), ["firstName", "lastName"]);
  assert.equal(filter.$and[0].$or[0].firstName.test("QA"), true);
  assert.equal(filter.$and[1].$or[1].lastName.test("Patient.*"), true);
  assert.equal(filter.$and[1].$or[1].lastName.test("PatientXYZ"), false);
});

test("appointments default empty statuses to scheduled", async () => {
  const appointment = new Appointment({
    owner: new mongoose.Types.ObjectId(),
    patient: new mongoose.Types.ObjectId(),
    doctor: new mongoose.Types.ObjectId(),
    startsAt: new Date("2026-11-05T06:00:00.000Z"),
    status: null,
  });
  await appointment.validate();
  assert.equal(appointment.status, "scheduled");
});

test("resource indexes cover tenant list sorting and common filtered reads", () => {
  const indexNames = (Model) => Model.schema.indexes().map(([keys]) => Object.keys(keys).join(","));
  assert.ok(indexNames(Doctor).includes("owner,createdAt,_id"));
  assert.ok(indexNames(Doctor).includes("owner,specialty"));
  assert.ok(indexNames(Patient).includes("owner,createdAt,_id"));
  assert.ok(indexNames(Patient).includes("owner,doctor,createdAt,_id"));
  assert.ok(indexNames(Patient).includes("owner,admittedAt"));
  assert.ok(indexNames(Appointment).includes("owner,createdAt,_id"));
  assert.ok(indexNames(Appointment).includes("owner,startsAt"));
  assert.ok(indexNames(Appointment).includes("owner,status,startsAt"));
  assert.ok(indexNames(Appointment).includes("owner,patient"));
});

test("pagination rejects malformed values and caps page size", () => {
  assert.deepEqual(parsePagination({}), { page: 1, pageSize: 20 });
  assert.deepEqual(parsePagination({ page: "3", pageSize: "200" }), { page: 3, pageSize: 100 });
  assert.throws(() => parsePagination({ page: "2abc" }), (error) => error.status === 400);
  assert.throws(() => parsePagination({ pageSize: "0" }), (error) => error.status === 400);
  assert.throws(() => parsePagination({ page: "9007199254740992" }), (error) => error.status === 400);
});

test("search validation rejects ambiguous, oversized, and excessive-token input", () => {
  assert.equal(parseSearch(undefined), "");
  assert.equal(parseSearch("  Farhana Ahmed "), "Farhana Ahmed");
  assert.throws(() => parseSearch(["Farhana", "Ahmed"]), (error) => error.status === 400);
  assert.throws(() => parseSearch("a".repeat(101)), (error) => error.status === 400);
  assert.throws(() => parseSearch("one two three four five six seven eight nine"), (error) => error.status === 400);
});

test("user roles default to regular users and support admin assignment", async () => {
  const user = new User({ name: "Test User", email: "user@example.test" });
  assert.equal(user.role, "user");
  assert.equal(user.password, undefined);
  user.role = "admin";
  await user.validate();
  assert.equal(user.role, "admin");
});

test("admin profile fields validate and do not store Firebase passwords", async () => {
  const user = new User({
    name: "Dr. Mahmudul Hasan",
    email: "admin@example.test",
    designation: "Chief Medical Officer",
    phone: "01712345678",
    hospitalFacility: "Dhaka Medical College Hospital",
    role: "admin",
  });
  await user.validate();
  assert.equal(user.designation, "Chief Medical Officer");
  assert.equal(user.phone, "01712345678");
  assert.equal(user.hospitalFacility, "Dhaka Medical College Hospital");
  assert.equal(user.password, undefined);
});

test("patient demo visibility is disabled unless explicitly seeded", async () => {
  const patient = new Patient({
    owner: new mongoose.Types.ObjectId(),
    medicalRecordNumber: "TEST-MRN",
    firstName: "Test",
    lastName: "Patient",
  });
  await patient.validate();
  assert.equal(patient.isDemo, false);
});

test("Firebase session identities require verified email", () => {
  assert.throws(
    () => requireVerifiedIdentity({
      uid: "firebase-user",
      email: "doctor@example.test",
      email_verified: false,
    }),
    (error) => error.status === 403 && /verify your email/i.test(error.message)
  );
  assert.deepEqual(
    requireVerifiedIdentity({
      uid: "firebase-user",
      email: " Doctor@Example.test ",
      email_verified: true,
    }),
    { email: "doctor@example.test", firebaseUid: "firebase-user" }
  );
});

test("mutating API requests reject cross-origin requests", async () => {
  const response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { origin: "https://attacker.example", "content-type": "application/json" },
    body: "{}",
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.match(body.message, /configured application/i);
});

test("invalid JSON receives a client error response", async () => {
  const response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{invalid",
  });
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.match(body.message, /valid JSON/i);
});

test("oversized JSON receives a 413 response", async () => {
  const response = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(51 * 1024) }),
  });
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.match(body.message, /too large/i);
});
