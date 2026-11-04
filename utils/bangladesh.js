const isValidMobile = (value) => {
  if (!value) return true;
  const compact = value.replace(/[\s()-]/g, "");
  return /^(?:(?:\+?88)?01[3-9]\d{8})$/.test(compact);
};

const bangladeshPhoneOptions = {
  validator: isValidMobile,
  message: "Enter a valid Bangladesh mobile number, such as 01712345678 or +8801712345678.",
};

module.exports = { bangladeshPhoneOptions, isBangladeshMobile: isValidMobile };
