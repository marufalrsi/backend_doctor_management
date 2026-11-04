const parsePositiveInteger = (value, defaultValue, field, maximum) => {
  if (value === undefined) return defaultValue;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    const error = new Error(`${field} must be a positive whole number.`);
    error.status = 400;
    throw error;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    const error = new Error(`${field} must be a safe whole number.`);
    error.status = 400;
    throw error;
  }
  return maximum ? Math.min(parsed, maximum) : parsed;
};

const parsePagination = (query) => ({
  page: parsePositiveInteger(query.page, 1, "Page"),
  pageSize: parsePositiveInteger(query.pageSize, 20, "Page size", 100),
});

module.exports = { parsePagination };
