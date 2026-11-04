const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildTokenSearchFilter = (fields, tokens) => ({
  $and: tokens.map((token) => {
    const expression = new RegExp(escapeRegex(token), "i");
    return {
      $or: fields.map((field) => ({ [field]: expression })),
    };
  }),
});

module.exports = { buildTokenSearchFilter };
