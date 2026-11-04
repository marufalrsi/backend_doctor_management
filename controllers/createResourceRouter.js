const express = require("express");
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const { buildDateFilter } = require("../utils/dateFilter");
const { buildTokenSearchFilter } = require("../utils/tokenSearch");
const { parsePagination } = require("../utils/queryPagination");
const { parseSearch } = require("../utils/querySearch");

const createResourceRouter = ({
  Model,
  fields,
  searchFields,
  queryFilters = [],
  populate = [],
  dateFilterField,
  resolveSearch,
  validateRelations,
  beforeDelete,
  afterDelete,
  facets = [],
}) => {
  const router = express.Router();
  const visibleFilter = (req) => req.user.isAdmin
    ? { $or: [{ owner: req.user._id }, { isDemo: true }] }
    : { owner: req.user._id };
  const ownerFilter = (req) => ({ owner: req.user._id });

  if (facets.length) {
    router.get("/facets", async (req, res, next) => {
      try {
        const values = await Promise.all(facets.map((field) => Model.distinct(field, visibleFilter(req))));
        return res.json({
          success: true,
          data: Object.fromEntries(facets.map((field, index) => [
            field,
            values[index].filter((value) => typeof value === "string" && value.trim()).sort((a, b) => a.localeCompare(b)),
          ])),
        });
      } catch (error) {
        return next(error);
      }
    });
  }

  router.get("/", async (req, res, next) => {
    try {
      const filter = visibleFilter(req);
      const search = parseSearch(req.query.search);
      const { page: requestedPageNumber, pageSize } = parsePagination(req.query);
      const conditions = [];
      if (search) {
        const tokens = search.split(/\s+/).filter(Boolean);
        const resolvedMatches = resolveSearch
          ? await resolveSearch({ search, tokens, req })
          : [];
        conditions.push({
          $or: [
            buildTokenSearchFilter(searchFields, tokens),
            ...resolvedMatches,
          ],
        });
      }
      if (dateFilterField && (req.query.date || req.query.dateRange)) {
        conditions.push({
          [dateFilterField]: buildDateFilter({
            date: req.query.date,
            range: req.query.dateRange,
          }),
        });
      }
      for (const field of queryFilters) {
        const rawValue = req.query[field];
        if (rawValue !== undefined && typeof rawValue !== "string") {
          const error = new Error(`${field} must be a single text value.`);
          error.status = 400;
          throw error;
        }
        const value = (rawValue || "").trim();
        if (value.length > 100) {
          const error = new Error(`${field} must be 100 characters or fewer.`);
          error.status = 400;
          throw error;
        }
        if (value) conditions.push({ [field]: value });
      }
      if (conditions.length) filter.$and = conditions;

      const total = await Model.countDocuments(filter);
      const totalPages = Math.ceil(total / pageSize);
      const page = totalPages ? Math.min(requestedPageNumber, totalPages) : 1;
      const records = await Model.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .populate(populate);
      const visibleRecords = records.map((record) => {
        const value = record.toObject();
        if (req.user.isAdmin && value.owner.toString() !== req.user._id.toString()) {
          value.readOnly = true;
        }
        return value;
      });
      return res.json({
        success: true,
        data: visibleRecords,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
        },
      });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/:id", async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid record ID." });
      }

      const query = Model.findOne({ _id: req.params.id, ...visibleFilter(req) });
      for (const path of populate) query.populate(path);
      const record = await query;
      if (!record) return res.status(404).json({ success: false, message: "Record not found." });
      const value = record.toObject();
      if (req.user.isAdmin && value.owner.toString() !== req.user._id.toString()) {
        value.readOnly = true;
      }
      return res.json({ success: true, data: value });
    } catch (error) {
      return next(error);
    }
  });

  router.post("/", async (req, res, next) => {
    try {
      const unsupportedFields = Object.keys(req.body || {}).filter((key) => !fields.includes(key));
      if (unsupportedFields.length > 0) {
        return res.status(400).json({ success: false, message: "The request contains unsupported fields." });
      }
      const data = Object.fromEntries(
        Object.entries(req.body || {}).filter(([key]) => fields.includes(key))
      );
      if (Model.modelName === "Patient" && !data.medicalRecordNumber) {
        data.medicalRecordNumber = `MRN-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
      }
      if (Object.keys(data).length === 0) {
        return res.status(400).json({ success: false, message: "Provide at least one supported field." });
      }
      if (validateRelations) await validateRelations(data, req.user._id);

      const record = await Model.create({ ...data, owner: req.user._id });
      return res.status(201).json({ success: true, data: record });
    } catch (error) {
      return next(error);
    }
  });

  router.patch("/:id", async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid record ID." });
      }

      const unsupportedFields = Object.keys(req.body || {}).filter((key) => !fields.includes(key));
      if (unsupportedFields.length > 0) {
        return res.status(400).json({ success: false, message: "The request contains unsupported fields." });
      }
      const data = Object.fromEntries(
        Object.entries(req.body || {}).filter(([key]) => fields.includes(key))
      );
      if (Object.keys(data).length === 0) {
        return res.status(400).json({ success: false, message: "Provide at least one supported field." });
      }
      if (validateRelations) await validateRelations(data, req.user._id);
      const record = await Model.findOneAndUpdate(
        { _id: req.params.id, ...ownerFilter(req) },
        { $set: data },
        { returnDocument: "after", runValidators: true, context: "query" }
      );
      if (!record) return res.status(404).json({ success: false, message: "Record not found." });
      return res.json({ success: true, data: record });
    } catch (error) {
      return next(error);
    }
  });

  router.delete("/:id", async (req, res, next) => {
    try {
      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid record ID." });
      }
      if (beforeDelete) await beforeDelete(req.params.id, req.user._id);
      const record = await Model.findOneAndDelete({
        _id: req.params.id,
        ...ownerFilter(req),
      });
      if (!record) return res.status(404).json({ success: false, message: "Record not found." });
      if (afterDelete) await afterDelete(record);
      return res.json({ success: true, message: "Record deleted." });
    } catch (error) {
      return next(error);
    }
  });

  return router;
};

module.exports = createResourceRouter;
