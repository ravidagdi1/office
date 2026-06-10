const Asset = require('../models/assetModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Inventory = require('../models/inventoryModel')
const mongoose = require('mongoose');
const AssetVehicle = require('../models/AssetVehicle');

// ✅ Create a new asset (automatically fills masterItem & store from inventory)
exports.createAsset = catchAsync(async (req, res, next) => {
  const {
    inventory,
    vendor,
    serialNumber,
    model,
    assignedTo,
    purchaseDate,
    warrantyExpiry,
    condition,
    status,
    remarks,
    active,
    equipmentNo,
    purchasedAmount,
    invoiceNo,
  } = req.body;

  // 🧠 Validate required fields
  if (!inventory || !serialNumber || !vendor) {
    return next(
      new AppError(
        'Missing required fields: inventory, serialNumber, vendor',
        400
      )
    );
  }

  // 🔎 Fetch Inventory details (to get masterItem & store)
  const inventoryDoc = await Inventory.findById(inventory).select('masterItem store');
  if (!inventoryDoc) {
    return next(new AppError('Invalid Inventory reference.', 404));
  }

  // 🧩 Ensure serial number is unique
  const existingAsset = await Asset.findOne({ serialNumber });
  if (existingAsset) {
    return next(new AppError('Serial number already exists', 400));
  }

  // 🏗️ Prepare asset data
  const assetData = {
    inventory,
    masterItem: inventoryDoc.masterItem, // ✅ auto-link to MasterList
    store: inventoryDoc.store,           // ✅ auto-link to Store
    vendor,
    serialNumber,
    model,
    assignedTo: assignedTo || null,
    purchaseDate: purchaseDate || null,
    warrantyExpiry: warrantyExpiry || null,
    condition: condition || 'Good',
    status: status || 'Available',
    remarks: remarks || '',
    active: active !== undefined ? active : true,
    equipmentNo: equipmentNo?.trim() || '',
    purchasedAmount: purchasedAmount ? Number(purchasedAmount) : 0,
    invoiceNo: invoiceNo?.trim() || '',
  };

  // 🛠️ Create the Asset
  const asset = await Asset.create(assetData);

  // ✅ Return success response
  res.status(201).json({
    status: 'success',
    message: 'Asset created successfully',
    data: { asset },
  });
});



// Get all assets
exports.getAllAssets = catchAsync(async (req, res, next) => {
  const assets = await Asset.find();
  res.status(200).json({
    status: 'success',
    results: assets.length,
    data: {
      assets,
    },
  });
});

// ✅ Get Assets by Store (with fallback to all)
exports.getAssetsByStore = catchAsync(async (req, res, next) => {
  const { store } = req.query || req.body; // store ID can come from query or body

  let filter = {};
  if (store) {
    filter.store = store; // Match assets belonging to the given store
  }

  const assets = await Asset.find(filter);

  res.status(200).json({
    status: 'success',
    message: store
      ? `Assets fetched successfully for store: ${store}`
      : 'All assets fetched successfully',
    results: assets.length,
    data: {
      assets,
    },
  });
});

//Get aviable assets after teh assent vechile assigmnet 

exports.getAvailableAssets = catchAsync(async (req, res, next) => {
  const { store } = req.query;

  // ✅ Step 1: Get used assets
  const usedAssets = await AssetVehicle.find({ isActive: true })
    .select('asset -_id')
    .lean();

  const usedAssetIds = usedAssets.map(a => a.asset);

  // ✅ Step 2: Base filter (NO store filter here)
  let filter = {
    _id: { $nin: usedAssetIds },
    active: true
  };

  // ✅ Step 3: Apply store filter ONLY if provided
 if (store && store !== 'undefined' && store !== 'null') {
  filter.store = store;
}

  // ✅ Step 4: Fetch assets (fast)
  const assets = await Asset.find(filter)
    .setOptions({ skipPopulate: true })
    .select('masterItem store serialNumber model')
    .populate({
      path: 'masterItem',
      select: 'description partNo'
    })
    .populate({
      path: 'store',
      select: 'name'
    })
    .lean();

  res.status(200).json({
    status: 'success',
    results: assets.length,
    data: assets
  });
});


//get assest by the inventory id
exports.getAssetsByInventory = catchAsync(async (req, res, next) => {
  console.log("📦 Fetching assets for inventory:", req.params.inventoryId);
  const { inventoryId } = req.params;

  // ✅ Validate ObjectId using Mongoose helper
  if (!mongoose.Types.ObjectId.isValid(inventoryId)) {
    return next(new AppError("Invalid Inventory ID format.", 400));
  }

  // ✅ Ensure inventory exists
  const inventoryExists = await Inventory.exists({ _id: inventoryId });
  if (!inventoryExists) {
    return next(new AppError("Inventory record not found.", 404));
  }

  // ✅ Fetch all assets linked to this inventory
  // ✅ Fetch all assets linked to this inventory except those in Transition
  const assets = await Asset.find({
    inventory: inventoryId,
    status: { $ne: "Transition" }, // 🚫 exclude assets currently in transition
  })
    .populate("assignedTo", "name email")
    .select("serialNumber model status assignedTo");


  // ✅ Always return a valid array, even if empty
  res.status(200).json({
    status: "success",
    results: assets.length,
    data: assets, // 👈 Always send `data: []` when none exist
  });
});




