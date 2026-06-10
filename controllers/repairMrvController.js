const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const Store = require('../models/storeModel');
const RepairMrv = require('../models/repairMrvFormModel');
const RepairPurchaseOrder = require('../models/repairPurchaseOrder');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const RepairItem = require('../models/repairItemModel')
const Inventory = require('../models/inventoryModel')
const RepairRequest = require('../models/repairRequestModel')
const mongoose = require('mongoose')



// ======================================================
// MULTER CONFIG
// ======================================================

// Store file in memory (buffer)
const multerStorage = multer.memoryStorage();

// Allow only images
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(
      new AppError('Not an image! Please upload only images.', 400),
      false
    );
  }
};

// Multer upload
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

// Single image upload (key: image)
exports.uploadRepairMrvPhoto = upload.single('image');


// ======================================================
// IMAGE RESIZE (SHARP)
// ======================================================
exports.resizeRepairMrvPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  const filename = `repair-mrv-${Date.now()}.jpeg`;
  const outputPath = path.join(
    __dirname,
    '../public/img/repair-mrv',
    filename
  );

  await sharp(req.file.buffer)
    .resize({ width: 800 })
    .toFormat('jpeg')
    .jpeg({ quality: 70, mozjpeg: true, progressive: true })
    .toFile(outputPath);

  // Attach filename for controller
  req.body.fileName = filename;
  next();
});


// ======================================================
// CREATE REPAIR MRV (STORE + SUPPLIER BASED)
// ======================================================
exports.createRepairMrv = catchAsync(async (req, res, next) => {
  const {
    store,
    supplier,
    billingNo,
    billingTitle,
    billingDate,
    itemCount,
    otherCharges,
    totalAmount
  } = req.body;

  // -------------------------------
  // 1. BASIC VALIDATION
  // -------------------------------
  if (!store || !supplier || !itemCount) {
    return next(
      new AppError(
        'Store, Supplier and Item Count are required',
        400
      )
    );
  }

  const user = req.user._id;
  const image = req.body.fileName || null;

  // -------------------------------
  // 2. VALIDATE STORE
  // -------------------------------
  const storeDoc = await Store.findById(store);
  if (!storeDoc) {
    return next(new AppError('Invalid Store ID', 400));
  }

  const storeCode = storeDoc.storeCode; // e.g. "0027"

  // -------------------------------
  // 3. GENERATE STORE-WISE REPAIR MRV NO
  // -------------------------------
  const minRange = parseInt(storeCode + '000000', 10);
  const maxRange = parseInt(storeCode + '999999', 10);

  const lastMrv = await RepairMrv.findOne({
    store,
    repairMrvNo: { $gte: minRange, $lte: maxRange }
  }).sort({ repairMrvNo: -1 });

  let newRepairMrvNo;
  if (lastMrv) {
    newRepairMrvNo = lastMrv.repairMrvNo + 1;
  } else {
    newRepairMrvNo = parseInt(storeCode + '000001', 10);
  }

  // -------------------------------
  // 4. CREATE REPAIR MRV
  // -------------------------------
  const repairMrv = await RepairMrv.create({
    store,
    supplier,
    user,
    image,
    repairMrvNo: newRepairMrvNo,
    billingNo,
    billingTitle: billingTitle || '',
    billingDate,
    itemCount,
    otherCharges: otherCharges || 0,
    totalAmount: totalAmount || 0
  });

  // -------------------------------
  // 5. RESPONSE
  // -------------------------------
  res.status(201).json({
    status: 'success',
    message: 'Repair MRV created successfully',
    data: {
      repairMrv
    }
  });
});




exports.getAllRepairMrv = catchAsync(async (req, res, next) => {
  const user = req.user;

  // store id comes as ?query=<storeId>
  const storeId = req.query.query;

  let filter = {};

  if (storeId) {
    filter = {
      store: storeId,
      status: 'open'   // 👈 only open Repair MRVs
    };
  }

  const doc = await RepairMrv.find(filter)
    .populate('supplier', 'name')
    .populate('store', 'name')
    .sort({ repairMrvNo: -1 });

  res.status(200).json({
    status: 'success',
    data: {
      data: doc
    }
  });
});


// localmrvsubmit new

exports.submitLocalRepairMrv = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrvId, items } = req.body;

    if (!mrvId || !Array.isArray(items)) {
      throw new AppError("Invalid request payload", 400);
    }

    const mrv = await RepairMrv.findById(mrvId).session(session);
    if (!mrv) {
      throw new AppError("No MRV found", 404);
    }

    for (const item of items) {
      const doc = await RepairItem.findById(item.id).session(session);
      if (!doc || doc.status === "recived") continue;

      const receivedQty = Number(item.recivedQty);
      const damageQty = Number(item.damageQty);
      const approvedQty = Number(doc.qtyRequired);

      // Validation
      if (receivedQty + damageQty > approvedQty) {
        throw new AppError(
          `Received + damaged quantity exceeds approved quantity`,
          400
        );
      }

      // -----------------------
      // UPDATE INVENTORY
      // -----------------------
      const inventory = await Inventory.findById(doc.inventory).session(session);
      if (!inventory) throw new AppError("Inventory not found", 404);

      inventory.repairQty -= receivedQty;
      if (inventory.repairQty < 0) {
        throw new AppError("Inventory quantity cannot be negative", 400);
      }

      await inventory.save({ session });

      // -----------------------
      // UPDATE CURRENT ITEM
      // -----------------------
      doc.status = "recived";
      doc.qtyRecived = receivedQty;
      doc.damageQty = damageQty;
      doc.repairMrv = mrv._id;

      await doc.save({ session });

      // -----------------------
      // CREATE REMAINING ITEM (if any)
      // -----------------------
      const remainingQty = approvedQty - (receivedQty + damageQty);

      if (remainingQty > 0) {
        await RepairItem.create(
          [{
            masterlist: doc.masterlist,
            inventory: doc.inventory,
            repairOrder: doc.repairOrder,
            user: doc.user,
            store: doc.store,
            // ✅ ADD THIS
            repairMrv: mrv._id,
            qtyRequired: remainingQty,
            approveQty: remainingQty,
            status: "local",
            poStatus: 'generated',
            flag: 'remain'
          }],
          { session }
        );
      }
    }

    // -----------------------
    // CLOSE MRV
    // -----------------------
    mrv.status = "close";
    await mrv.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: "success",
      message: "Repair MRV processed successfully"
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return next(err);
  }
});


// repairmrvsubmit

exports.submitMrv = catchAsync(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { mrvId, items } = req.body;

    if (!mrvId || !Array.isArray(items) || items.length === 0) {
      return next(new AppError("MRV ID and items are required", 400));
    }

    const ALLOWED_EXCESS_PARTS = [
      "20634", "20635", "20636", "20637", "20638",
      "20639", "21766", "23470", "23471", "23472"
    ];

    const mrv = await RepairMrv.findById(mrvId).session(session);
    if (!mrv) return next(new AppError("MRV not found", 404));

    const affectedPOs = new Set();

    for (const item of items) {

      const repairItem = await RepairItem.findById(item.id)
        .populate("inventory")
        .session(session);

      if (!repairItem || repairItem.status === "recived") continue;

      const approveQty = Number(item.approveQty);
      const receivedQty = Number(item.recivedQty);
      const damageQty = Number(item.damageQty || 0);

      const partNo = repairItem.inventory?.masterItem?.partNo;

      // ---------------- VALIDATIONS ----------------
      let allowedQty = approveQty - damageQty;
      if (ALLOWED_EXCESS_PARTS.includes(String(partNo))) {
        allowedQty = approveQty + approveQty * 0.05;
      }

      if (receivedQty < 0)
        throw new AppError(`Invalid received qty for part ${partNo}`, 400);

      if (receivedQty > allowedQty)
        throw new AppError(`Received qty exceeds allowed limit for part ${partNo}`, 400);

      // ---------------- UPDATE REPAIR ITEM ----------------
      repairItem.qtyRecived = receivedQty;
      repairItem.damageQty = damageQty;
      repairItem.status = "recived";
      repairItem.repairMrv = mrv._id;


      await repairItem.save({ session });

      // ---------------- TRACK PO ----------------
      const poId = repairItem.po?._id || repairItem.po;
      if (poId) affectedPOs.add(poId.toString());

      // ---------------- UPDATE INVENTORY ----------------
      const inventory = await Inventory.findById(repairItem.inventory).session(session);
      if (!inventory) throw new AppError("Inventory not found", 404);

      inventory.repairQty = (inventory.repairQty || 0) - receivedQty;

      if (inventory.repairQty < 0) {
        throw new AppError(
          `Inventory repairQty cannot be negative for part ${partNo}`,
          400
        );
      }

      await inventory.save({ session });


      // ---------------- CREATE REMAINING ITEM ----------------
      if (receivedQty + damageQty < approveQty) {
        await RepairItem.create(
          [{
            masterlist: repairItem.masterlist,
            inventory: repairItem.inventory,
            repairOrder: repairItem.repairOrder,
            user: repairItem.user,
            store: repairItem.store,
            repairMrv: mrv._id,
            approveQty: approveQty - (receivedQty + damageQty),
            qtyRequired: approveQty - (receivedQty + damageQty),
            status: "approved",
            flag: "remain",
            poStatus: 'generated',
            po: repairItem.po?._id || repairItem.po
          }],
          { session }
        );
      }
    }

    // ---------------- UPDATE PO STATUS ----------------
    for (const poId of affectedPOs) {
      const remaining = await RepairItem.find({
        po: poId,
        status: { $ne: "recived" }   // ✅ ONLY THIS MATTERS
      });


      await RepairPurchaseOrder.findByIdAndUpdate(
        poId,
        {
          status: remaining.length === 0
            ? "Order-Received"
            : "Partially-Received",
        },
        { session }
      );
    }

    // ---------------- FINALIZE MRV ----------------
    mrv.status = "close";
    await mrv.save({ session });

    await session.commitTransaction();
    session.endSession();

    return res.status(200).json({
      status: "success",
      message: "MRV processed successfully"
    });

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return next(err);
  }
});









