const { isBangladeshMobile } = require("./bangladesh");

const validateAdminRegistrationProfile = ({
  name,
  designation,
  phone,
  hospitalFacility,
  authorizationConfirmed,
}) => {
  if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100) {
    return "Enter an admin name between 2 and 100 characters.";
  }
  if (typeof designation !== "string" || designation.trim().length < 2 || designation.trim().length > 100) {
    return "Enter a designation or role between 2 and 100 characters.";
  }
  if (typeof phone !== "string" || !isBangladeshMobile(phone.trim())) {
    return "Enter a valid Bangladesh mobile number for 2FA.";
  }
  if (typeof hospitalFacility !== "string" || hospitalFacility.trim().length < 2 || hospitalFacility.trim().length > 150) {
    return "Select or enter a hospital facility.";
  }
  if (authorizationConfirmed !== true) {
    return "Confirm that you have authorized hospital administrative clearance.";
  }
  return null;
};

module.exports = { validateAdminRegistrationProfile };
