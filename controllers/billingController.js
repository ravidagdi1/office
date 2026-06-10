//const User = require('../models/use');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');
const AppError = require('../utils/appError');
const BillingModel=require('../models/billingSchemaModel');

// Escape regex special characters in user input
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.allBillingAddressState = catchAsync(async (req, res, next) => {
  const { state } = req.params;


  // ✅ Validation
  if (!state || typeof state !== 'string' || state.trim().length < 2) {
    return next(new AppError('Please provide a valid state name in the URL.', 400));
  }

  const cleanedState = state.trim();
  const safeRegexState = escapeRegex(cleanedState); // ✅ DEFINE THIS BEFORE USING


  // ✅ Case-insensitive filter on top-level "state"
  const filter = {
    state: {
      $regex: new RegExp(`^${safeRegexState}$`, 'i') // full match, ignore case
    }
  };

  const billingAddresses = await BillingModel.find(filter);

  if (!billingAddresses || billingAddresses.length === 0) {
    return next(
      new AppError(`No billing addresses found for the state: ${cleanedState}`, 404)
    );
  }

  res.status(200).json({
    status: 'success',
    results: billingAddresses.length,
    data: billingAddresses
  });
});





