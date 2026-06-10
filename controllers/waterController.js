const MasterList = require('../models/masterListModel');
const Request = require('../models/requestedModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const Inventory = require('../models/inventoryModel');
const AppError = require('../utils/appError');
const multer = require('multer');
const sharp = require('sharp');
const Item = require('../models/itemModel');
const fs = require('fs');
const Mrv = require('../models/mrvFormModel');
const path = require('path');

const mongoose=require('mongoose')

// ✅ Existing Controller: Get all MRVs for a specific store
exports.getAllMRV = catchAsync(async (req, res, next) => {
  const { storeId } = req.params;
  console.log("storeId",storeId)

  if (!storeId) {
    return next(new AppError('Store ID is required', 400));
  }

  const hardcodedPartNo = 22776;

  const masterItem = await MasterList.findOne({ partNo: hardcodedPartNo });

  if (!masterItem) {
    return next(new AppError('No item found with partNo 22776', 404));
  }

  const inventories = await Inventory.find({
    store: storeId,
    masterItem: masterItem._id,
  });

  if (!inventories.length) {
    return next(new AppError('No inventory found for the given store and partNo', 404));
  }

  const inventoryIds = inventories.map((inv) => inv._id);

  const items = await Item.find({
    inventory: { $in: inventoryIds },
    status: 'recived',
    waterConsumedStatus:'notConsumed',
  });

  if (!items.length) {
    return next(new AppError('No items found for this store and partNo', 404));
  }

  const uniqueMrvIds = [
    ...new Set(
      items
        .filter((item) => item.mrv)
        .map((item) =>
          typeof item.mrv === 'object'
            ? item.mrv._id?.toString()
            : item.mrv.toString()
        )
    ),
  ];

  const requisitions = await Mrv.find({
    _id: { $in: uniqueMrvIds },
  }).select('requisitionNo department createdAt');

  res.status(200).json({
    status: 'success',
    total: requisitions.length,
    data: requisitions,
    masterItem,
    items,
  });
});

// ✅ New Controller: Get items for a specific MRV
exports.getItemsForMRV = catchAsync(async (req, res, next) => {
  const { storeId, mrvId } = req.params;

  if (!storeId || !mrvId) {
    return next(new AppError('Store ID and MRV ID are required', 400));
  }

  const mrv = await Mrv.findById(mrvId);
  if (!mrv) {
    return next(new AppError('No MRV found with this ID', 404));
  }

  const hardcodedPartNo = 22776;

  // Step 1: Get master item
  const masterItem = await MasterList.findOne({ partNo: hardcodedPartNo });
  if (!masterItem) {
    return next(new AppError(`No item found with partNo ${hardcodedPartNo}`, 404));
  }

  // Step 2: Find inventory for store and this master item
  const inventories = await Inventory.find({
    store: storeId,
    masterItem: masterItem._id,
  });

  const inventoryIds = inventories.map((inv) => inv._id);
  if (!inventoryIds.length) {
    return next(new AppError('No inventory found for this store and partNo', 404));
  }

  // Step 3: Filter items
  const items = await Item.find({
    inventory: { $in: inventoryIds },
    mrv: mrvId,
    status: 'recived',
    waterConsumedStatus: 'notConsumed',
  })
    .populate('requisitionNo', 'requisitionNo department createdAt')
    .populate('inventory', 'store');

  if (!items.length) {
    return next(new AppError('No items found for this MRV, store, and partNo', 404));
  }

  const uniqueRequisitionIds = [
    ...new Set(
      items
        .filter((item) => item.requisitionNo)
        .map((item) =>
          typeof item.requisitionNo === 'object'
            ? item.requisitionNo._id?.toString()
            : item.requisitionNo.toString()
        )
    ),
  ];

  const requisitions = await Request.find({
    _id: { $in: uniqueRequisitionIds },
  }).select('requisitionNo department createdAt');

  res.status(200).json({
    status: 'success',
    total: items.length,
    data: {
      mrv,
      requisitions,
      items,
    },
  });
});
