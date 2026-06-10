const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const UnitConversion = require('../models/UnitConversion');
const factory = require('./handlerFactory');



exports.createConversion = catchAsync(async (req, res, next) => {
    const { masterPart, fromUnit, toUnit, conversionValue } = req.body;

    // 🧠 Validate fields
    if (!masterPart || !fromUnit || !toUnit || !conversionValue) {
        return next(new AppError('All fields are required.', 400));
    }

    // 🧠 Ensure From and To units are not the same
    if (fromUnit === toUnit) {
        return next(new AppError('From Unit and To Unit cannot be the same.', 400));
    }

    // 🧠 Check for duplicate conversion
    const existing = await UnitConversion.findOne({
        masterPart,
        fromUnit,
        toUnit,
    });

    if (existing) {
        return next(
            new AppError('Conversion rule already exists for this combination.', 400)
        );
    }

    // 🧠 Create new conversion
    const newConversion = await UnitConversion.create({
        masterPart,
        fromUnit,
        toUnit,
        conversionValue,
    });

    // ✅ Send response
    res.status(201).json({
        status: 201,
        message: 'Unit Conversion Added Successfully!',
    });

});

exports.getUnitById = factory.getOne(UnitConversion);
exports.getAllConversionUnit = factory.getAll(UnitConversion);

// ✅ Get conversion rule(s) by masterPart and fromUnit
exports.getConversionByPartAndUnit = catchAsync(async (req, res, next) => {
  const { masterPart, fromUnit } = req.query;

  // 🧠 Validate required fields
  if (!masterPart || !fromUnit) {
    return next(new AppError('masterPart and fromUnit are required.', 400));
  }

  // 🔍 Find conversions (auto-populated by schema middleware)
  const conversions = await UnitConversion.find({
    masterPart,
    fromUnit,
    active: true,
  }).select('toUnit conversionValue');

  // 🧠 If none found
  if (!conversions || conversions.length === 0) {
    return next(new AppError('No conversion rule found for this combination.', 404));
  }

  // ✅ Send response
  res.status(200).json({
    status: 'success',
    count: conversions.length,
    data: conversions,
  });
});

exports.updateUnitById = factory.updateOne(UnitConversion);
exports.deleteConversion = factory.deleteOne(UnitConversion);
