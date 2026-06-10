const mongoose = require("mongoose");

const unitConversionSchema = new mongoose.Schema(
  {
    masterPart: {
      type: mongoose.Schema.ObjectId,
      ref: "MasterList",
      required: true,
      index: true, // ⚡ improves lookup speed
    },
    fromUnit: {
      type: mongoose.Schema.ObjectId,
      ref: "Unit",
      required: true,
    },
    toUnit: {
      type: mongoose.Schema.ObjectId,
      ref: "Unit",
      required: true,
    },
    conversionValue: {
      type: Number,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// ✅ Prevent duplicate rules for the same part/unit combination
unitConversionSchema.index(
  { masterPart: 1, fromUnit: 1, toUnit: 1 },
  { unique: true }
);

unitConversionSchema.pre(/^find/, function (next) {
  this.populate({
    path: "masterPart",
    select: "partNo description category subCategory unit",
    populate: [
      { path: "category", select: "name" },
      { path: "subCategory", select: "name" },
      { path: "unit", select: "name symbol" },
    ],
  })
    .populate({
      path: "fromUnit",
      select: "name symbol",
    })
    .populate({
      path: "toUnit",
      select: "name symbol",
    });
  next();
});


module.exports = mongoose.model("UnitConversion", unitConversionSchema);
