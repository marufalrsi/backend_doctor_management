const parseSearch = (value) => {
  if (value === undefined) return "";
  if (typeof value !== "string") {
    const error = new Error("Search must be a single text value.");
    error.status = 400;
    throw error;
  }

  const search = value.trim();
  if (search.length > 100) {
    const error = new Error("Search must be 100 characters or fewer.");
    error.status = 400;
    throw error;
  }
  if (search && search.split(/\s+/).length > 8) {
    const error = new Error("Search can contain at most 8 words.");
    error.status = 400;
    throw error;
  }
  return search;
};

module.exports = { parseSearch };
