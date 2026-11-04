const DAY_IN_MS = 24 * 60 * 60 * 1000;
const PRESET_DAYS = { "24h": 1, "3d": 3, "7d": 7 };

const invalidDateFilter = () => {
  const error = new Error("Choose a valid date filter.");
  error.status = 400;
  return error;
};

const buildDateFilter = ({ date, range, now = new Date() }) => {
  if (date) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw invalidDateFilter();
    }

    const start = new Date(`${date}T00:00:00.000+06:00`);
    if (!Number.isFinite(start.getTime())) throw invalidDateFilter();
    const localDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(start);
    if (localDate !== date) {
      throw invalidDateFilter();
    }

    return { $gte: start, $lt: new Date(start.getTime() + DAY_IN_MS) };
  }

  if (!range || range === "all") return undefined;
  const days = PRESET_DAYS[range];
  if (!days || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw invalidDateFilter();
  }

  return { $gte: new Date(now.getTime() - days * DAY_IN_MS), $lt: now };
};

module.exports = { buildDateFilter };
