const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const SupplierRate = require('../models/SupplierRateMaster');


// ✅ Get All Supplier Rates (Filter by Status)
exports.getAllSupplierRatesByStatus = catchAsync(async (req, res, next) => {
  try {
    const { status } = req.query;

    let filter = {};

    // ✅ If status is provided, validate and apply filter
    if (status) {
      const allowedStatus = ["Active", "Expired"];

      if (!allowedStatus.includes(status)) {
        return next(
          new AppError("Invalid status value. Allowed: Active or Expired", 400)
        );
      }

      filter.status = status;
    }

    const rates = await SupplierRate.find(filter)
      .populate("supplierId")
      .sort({ createdAt: -1 });

    res.status(200).json({
      status: "success",
      results: rates.length,
      data: rates,
    });

  } catch (err) {
    return next(new AppError(err.message, 500));
  }
});
