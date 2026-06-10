const AssetVehicle = require('../models/AssetVehicle');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const mongoose = require('mongoose');

// ✅ CREATE (MULTIPLE ROWS)
exports.createAssetVehicle = catchAsync(async (req, res, next) => {
  const { rows } = req.body;

  if (!rows || rows.length === 0) {
    return next(new AppError('No asset vehicle data provided', 400));
  }

  const payload = [];
  const errors = [];

  // ✅ Prepare asset IDs
  const assetIds = rows.map(r => r.asset?.value).filter(Boolean);

  // ✅ Fetch existing assets in ONE query
  const existingAssets = await AssetVehicle.find({
    asset: { $in: assetIds }
  }).select('asset');

  const existingSet = new Set(existingAssets.map(e => e.asset.toString()));

  // ✅ Track duplicates inside request
  const requestAssetSet = new Set();

  for (let [index, row] of rows.entries()) {
    const rowNo = index + 1;

    const avg = Number(row.average);
    const cap = Number(row.capacity);

    let isValid = true; // ✅ IMPORTANT

    // 🔴 VALIDATIONS
    if (!row.asset?.value) {
      errors.push(`Row ${rowNo}: Asset is required`);
      isValid = false;
    }

    if (!avg || avg <= 0) {
      errors.push(`Row ${rowNo}: Average must be greater than 0`);
      isValid = false;
    }

    if (!cap || cap <= 0) {
      errors.push(`Row ${rowNo}: Capacity must be greater than 0`);
      isValid = false;
    }

    if (!row.vehicleType) {
      errors.push(`Row ${rowNo}: Vehicle type is required`);
      isValid = false;
    }

    if (!row.operators || row.operators.length === 0) {
      errors.push(`Row ${rowNo}: At least one driver required`);
      isValid = false;
    }

    // ✅ Duplicate inside request
    if (requestAssetSet.has(row.asset?.value)) {
      errors.push(`Row ${rowNo}: Duplicate asset in request`);
      isValid = false;
    } else {
      requestAssetSet.add(row.asset?.value);
    }

    // ✅ Duplicate in DB
    if (existingSet.has(row.asset?.value)) {
      errors.push(`Row ${rowNo}: Asset already exists (${row.asset?.label})`);
      isValid = false;
    }

    // ✅ PUSH ONLY VALID DATA
    if (isValid) {
      payload.push({
        asset: row.asset.value,
        average: avg,
        capacity: cap,
        vehicleType: row.vehicleType?.value || row.vehicleType,
        operators: row.operators.map(op => op.value)
      });
    }
  }

  // ❌ If any validation errors → stop
  if (errors.length > 0) {
    return next(
      new AppError(`Validation failed: ${errors.join(' | ')}`, 400)
    );
  }

  // ✅ Insert data
  const result = await AssetVehicle.insertMany(payload);

  res.status(201).json({
    status: 'success',
    message: 'Asset vehicles created successfully',
    count: result.length,
    data: result
  });
});

exports.getAllAssetVehicles = catchAsync(async (req, res, next) => {

  const data = await AssetVehicle.find()

    // ✅ Asset → main data source
    .populate({
      path: 'asset',
      // ✅ INCLUDE REQUIRED FIELDS FROM ASSET
      select: 'serialNumber model equipmentNo vendor masterItem store',
      populate: [
        {
          // ✅ Only for description, partNo, category
          path: 'masterItem',
          select: 'description partNo category',
          populate: {
            path: 'category',
            select: 'name'
          }
        },
        {
          // ✅ Store name
          path: 'store',
          select: 'name'
        }
      ]
    })

    // ✅ Operators → User
    .populate({
      path: 'operators',
      select: 'name'
    });

  // ❌ If no data found
  if (!data || data.length === 0) {
    return next(new AppError('No asset vehicles found', 404));
  }

  // ✅ Success response
  res.status(200).json({
    status: 'success',
    results: data.length,
    data
  });

});


exports.updateAssetVehicle = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  // ✅ ID validation
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError('Invalid AssetVehicle ID', 400));
  }

  const allowedFields = ['operators', 'isActive', 'average', 'capacity'];
  const requestFields = Object.keys(req.body);

  // ❌ Reject unknown fields
  const invalidFields = requestFields.filter(
    (field) => !allowedFields.includes(field)
  );

  if (invalidFields.length > 0) {
    return next(
      new AppError(
        `Invalid fields: ${invalidFields.join(', ')}`,
        400
      )
    );
  }

  // ❌ Empty body check
  if (requestFields.length === 0) {
    return next(new AppError('No data provided to update', 400));
  }

  // 🔍 Check record exists
  const existing = await AssetVehicle.findById(id);
  if (!existing) {
    return next(new AppError('AssetVehicle not found', 404));
  }

  const updateData = {};

  // ✅ Operators validation
  if (req.body.operators !== undefined) {
    if (!Array.isArray(req.body.operators)) {
      return next(new AppError('Operators must be an array', 400));
    }
    updateData.operators = req.body.operators;
  }

  // ✅ isActive validation
  if (req.body.isActive !== undefined) {
    if (typeof req.body.isActive !== 'boolean') {
      return next(new AppError('isActive must be boolean', 400));
    }
    updateData.isActive = req.body.isActive;
  }

  // ✅ Average validation
  if (req.body.average !== undefined) {
    const avg = Number(req.body.average);
    if (isNaN(avg) || avg <= 0) {
      return next(new AppError('Average must be greater than 0', 400));
    }
    updateData.average = avg;
  }

  // ✅ Capacity validation
  if (req.body.capacity !== undefined) {
    const cap = Number(req.body.capacity);
    if (isNaN(cap) || cap <= 0) {
      return next(new AppError('Capacity must be greater than 0', 400));
    }
    updateData.capacity = cap;
  }

  // ✅ Update
  const updated = await AssetVehicle.findByIdAndUpdate(
    id,
    updateData,
    {
      new: true,
      runValidators: true,
    }
  )
    .populate({
      path: 'operators',
      select: 'name'
    })
    .populate({
      path: 'asset',
      select: 'serialNumber model equipmentNo vendor',
      populate: [
        {
          path: 'masterItem',
          select: 'description partNo category',
          populate: {
            path: 'category',
            select: 'name'
          }
        },
        {
          path: 'store',
          select: 'name'
        }
      ]
    });

  res.status(200).json({
    status: 'success',
    message: 'AssetVehicle updated successfully',
    data: updated,
  });
});