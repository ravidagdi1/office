
const Request = require('../models/requestedModel');
const Store = require('../models/storeModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const Inventory = require('../models/inventoryModel');
const AppError = require('../utils/appError');
const mongoose = require('mongoose')
const multer = require('multer');
const sharp = require('sharp');
const Item = require('../models/itemModel');
const Mrv = require('../models/mrvFormModel');
const fs = require('fs')
const TransferItem = require('../models/transferItemModel')
const path = require('path');
const PurchaseOrder = require('../models/PurchaseOrder'); // <-- Ensure this import exists
// after modfication

// ✅ Ensure folders exist
const uploadDir = path.join(__dirname, '../public/img/mrv');
const tempDir = path.join(__dirname, '../public/img/temp');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// ✅ Use TEMP folder for upload
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    cb(null, `temp-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpeg`);
  }
});

// ✅ Accept only images
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

// ✅ Multer setup
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

// ✅ Upload middleware
exports.uploadProductPhoto = upload.single('image');


// ✅ ✅ FIXED SAFE DELETE (WINDOWS EPERM HANDLED)
const deleteFileSafe = (filePath) => {
  if (!filePath) return;

  const tryDelete = (retry = 0) => {
    if (!fs.existsSync(filePath)) return;

    fs.unlink(filePath, (err) => {
      if (!err) {
        console.log("🧹 Temp deleted:", filePath);
        return;
      }

      // 🔥 HANDLE WINDOWS LOCK ISSUE
      if (err.code === "EPERM" || err.code === "EBUSY") {
        if (retry < 5) {
          console.log(`🔁 Retry delete (${retry + 1})...`);
          return setTimeout(() => tryDelete(retry + 1), 1000);
        }
      }

      console.error("❌ Delete failed:", err.message);
    });
  };

  tryDelete();
};


// ✅ Resize + compress + safe delete
exports.resizeProductPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  const tempPath = req.file.path;

  try {
    const filename = `mrv-${Date.now()}-${Math.round(Math.random() * 1e9)}.jpeg`;
    const outputPath = path.join(uploadDir, filename);

    // ✅ Resize & compress
    await sharp(tempPath)
      .resize({ width: 800 })
      .jpeg({ quality: 60 })
      .toFile(outputPath);

    // ✅ Delete temp (with retry)
    deleteFileSafe(tempPath);

    // ✅ Save filename
    req.body.fileName = filename;

    next();

  } catch (err) {
    console.error("SHARP ERROR 👉", err);

    // ✅ delete temp even on error
    deleteFileSafe(tempPath);

    return next(new AppError("Image processing failed. Try smaller image.", 400));
  }
});
//old mrv createion
/*
exports.createMrv = catchAsync(async (req, res, next) => {

    req.body.user = req.user._id;
    req.body.image = req.body.fileName

    const doc = await Mrv.create(req.body);
    if (!doc) {
      console.log('log')
      return next(new AppError('No document found with that ID', 404));
    }
    res.status(201).json({
      status: 'success',
      data: {
        data: doc
      }
    });
});
*/


exports.createMrv = catchAsync(async (req, res, next) => {
  const { store, billingNo, billingDate, supplier, itemCount, otherCharges, totalAmount, billingTitle } = req.body;

  // 🔑 Sharp middleware already saved file & set req.body.fileName
  const image = req.body.fileName || null;

  req.body.user = req.user._id;

  // 1. Find storeCode from store table
  const storeDoc = await Store.findById(store);
  if (!storeDoc) {
    return res.status(400).json({ status: "fail", message: "Invalid store ID" });
  }
  const storeCode = storeDoc.storeCode; // e.g. "0027"

  // 2. Define numeric range for this store
  const minRange = parseInt(storeCode + "000000", 10);
  const maxRange = parseInt(storeCode + "999999", 10);

  // 3. Find last MRV for this store within its range
  const lastMrv = await Mrv.findOne({
    store: store,
    mrvNo: { $gte: minRange, $lte: maxRange }
  }).sort({ mrvNo: -1 });

  let newMrvNo;
  if (lastMrv) {
    newMrvNo = lastMrv.mrvNo + 1;
  } else {
    newMrvNo = parseInt(storeCode + "000001", 10);
  }

  // 4. Create MRV
  const newMrv = await Mrv.create({
    store,
    billingNo,
    billingTitle: billingTitle || '',
    billingDate,
    image,               // ✅ Sharp file
    user: req.body.user,
    mrvNo: newMrvNo,
    supplier,
    itemCount,
    otherCharges: otherCharges || 0,
    totalAmount: totalAmount || 0,
  });

  res.status(201).json({
    status: "success",
    data: { mrv: newMrv },
  });
});






exports.getAllMrv = catchAsync(async (req, res, next) => {

  const user = req.user;
  console.log("user ", req.query.query)
  console.log("user 2", user)
  let filter = {};


  filter = { store: req.query.query, status: "open" }

  const doc = await Mrv.find(filter)

  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
})

exports.submitDesile = catchAsync(async (req, res, next) => {

  const items = req.body.items;
  const item = items[0]

  const demo = await Item.findById(item.id)
  console.log("item", demo)
  const mrv = await Mrv.findById(demo.mrv)
  if (!mrv) {
    return next(new AppError('No Mrv found for this Id', 404));
  }

  let doc;


  doc = await Item.findByIdAndUpdate(item.id, { status: "recived", qtyRecived: Number(item.recivedQty), damageQty: Number(item.damageQty) })



  // Now find the related inventory and update it
  const inventory = await Inventory.findById(doc.inventory._id);

  console.log("inventory", inventory)
  if (!inventory) {
    return next(new AppError('No inventory found for this item', 404));
  }


  inventory.reciveQty = item.recivedQty;  // Add received quantity to current stock
  inventory.totalRecive += item.recivedQty;   // Update the total received quantity
  // inventory.reqestedQty = item.approveQty;
  inventory.currentStock += item.recivedQty;



  // // You can update other fields like `lp`, `totalMiv`, etc. here if needed

  await inventory.save();

  mrv.status = "close"
  await mrv.save()
  res.status(201).json({
    status: 'success',
    message: 'successfully submited !'
  });

})
// old submitmrv without mrv capturing
/*
exports.submitMrv1 = catchAsync(async (req, res, next) => {
  console.log("bodyItem", req.body);

  const mrvId = req.body.mrvId;
  const items = req.body.items;

  const mrv = await Mrv.findById(mrvId);
  if (!mrv) {
    return next(new AppError('No Mrv found for this Id', 404));
  }

  const poIdsToCheck = new Set();

  for (const item of items) {
    let doc = await Item.findById(item.id);

    if (!doc || doc.status === "recived") {
      console.log("Skipping item as it is already received", item);
      continue;
    }

    // Collect PO ID
    if (doc.po) {
      poIdsToCheck.add(doc.po.toString());
    }

    if ((Number(item.damageQty) + Number(item.recivedQty)) === Number(item.approveQty)) {
      console.log("if ", item);
      doc = await Item.findByIdAndUpdate(item.id, {
        status: "recived",
        qtyRecived: Number(item.recivedQty),
        damageQty: Number(item.damageQty),
        mrv: mrvId
      });
    } else {
      console.log("else", item);
      const oldstatus = doc.status;
      const POId = doc.po;
      console.log("jdjjdjdjdjdjddj", POId);

      const remain = Number(item.approveQty) - (Number(item.recivedQty) + Number(item.damageQty));

      doc = await Item.findByIdAndUpdate(item.id, {
        status: "recived",
        qtyRecived: Number(item.recivedQty),
        damageQty: Number(item.damageQty),
        mrv: mrvId
      });

      const { user, store, inventory, requisitionNo } = doc;

      const approveQty = remain;
      const qtyRequired = remain;
      const flag = "remain";
      const status = oldstatus;
      const poStatus = 'generated';
      const po = POId;

      await Item.create({
        user,
        store,
        inventory,
        requisitionNo,
        approveQty,
        qtyRequired,
        flag,
        status,
        poStatus,
        po
      });
    }

    const inventory = await Inventory.findById(doc.inventory._id);

    if (!inventory) {
      return next(new AppError('No inventory found for this item', 404));
    }

    inventory.reciveQty = Number(item.recivedQty);
    inventory.totalRecive += Number(item.recivedQty);
    inventory.currentStock += Number(item.recivedQty);
    inventory.damage += Number(item.damageQty);

    await inventory.save();
  }

  // Update PO status after processing items
  for (const poId of poIdsToCheck) {
    const remaining = await Item.find({ po: poId, status: { $ne: 'recived' } });

    if (remaining.length === 0) {
      await PurchaseOrder.findByIdAndUpdate(poId, { status: 'Order-Received' });
      console.log(`PO ${poId} marked as Order-Received`);
    } else {
      await PurchaseOrder.findByIdAndUpdate(poId, { status: 'Partially-Received' });
      console.log(`PO ${poId} marked as Partially-Received`);
    }
  }

  mrv.status = "close";
  await mrv.save();

  res.status(201).json({
    status: 'success',
    message: 'successfully submited !'
  });
});
*/

// new submitMrv with MRV capturing without allow execces aamount for few part number
{ /* exports.submitMrv = catchAsync(async (req, res, next) => {
  console.log("bodyItem", req.body);

  // Convert MRV ID to ObjectId
  const mrvId = new mongoose.Types.ObjectId(req.body.mrvId);
  console.log('mrvIDDDD', mrvId);
  console.log('mrvIDDDDtypeeeeoffff', typeof mrvId);

  const items = req.body.items;

  // Fetch MRV document
  const mrv = await Mrv.findById(mrvId);
  if (!mrv) {
    return next(new AppError('No MRV found for this ID', 404));
  }

  const poIdsToCheck = new Set();

  for (const item of items) {
    let doc = await Item.findById(item.id);

    if (!doc || doc.status === "recived") {
      console.log("Skipping item as it is already received", item);
      continue;
    }

    // Store original status before updating
    const originalStatus = doc.status;

    // Safely get PO ID (string or ObjectId)
    const POId = doc.po?._id ? doc.po._id.toString() : doc.po?.toString();
    if (POId) poIdsToCheck.add(POId);

    const fullyReceived = (Number(item.damageQty) + Number(item.recivedQty)) === Number(item.approveQty);

    // Update item with received quantities and MRV reference
    doc = await Item.findByIdAndUpdate(item.id, {
      status: "recived",
      qtyRecived: Number(item.recivedQty),
      damageQty: Number(item.damageQty),
      mrv: mrvId
    }, { new: true });

    // Update PurchaseOrder's specific item with MRV reference
    if (POId) {
      const po = await PurchaseOrder.findById(POId);
      if (po && Array.isArray(po.items)) {
        const index = po.items.findIndex(i => i.partNo === doc.inventory?.masterItem?.partNo);
        if (index !== -1) {
          po.items[index].mrv = mrvId;
          await po.save();
        }
      }
    }

    // Handle partially received items
    if (!fullyReceived) {
      const remain = Number(item.approveQty) - (Number(item.recivedQty) + Number(item.damageQty));
      const { user, store, inventory, requisitionNo } = doc;

      await Item.create({
        user,
        store,
        inventory,
        requisitionNo,
        approveQty: remain,
        qtyRequired: remain,
        flag: "remain",
        status: originalStatus, // Use original status here
        poStatus: 'generated',
        po: POId
      });
    }

    // Update inventory
    const inventory = await Inventory.findById(doc.inventory._id);
    if (!inventory) {
      return next(new AppError('No inventory found for this item', 404));
    }

    inventory.reciveQty = Number(item.recivedQty);
    inventory.totalRecive += Number(item.recivedQty);
    inventory.currentStock += Number(item.recivedQty);
    inventory.damage += Number(item.damageQty);

    await inventory.save();
  }

  // Update PurchaseOrder status
  for (const poId of poIdsToCheck) {
    const remaining = await Item.find({ po: poId, status: { $ne: 'recived' } });

    if (remaining.length === 0) {
      await PurchaseOrder.findByIdAndUpdate(poId, { status: 'Order-Received',billingStatus:'start' });
      console.log(`PO ${poId} marked as Order-Received`);
    } else {
      await PurchaseOrder.findByIdAndUpdate(poId, { status: 'Partially-Received' });
      console.log(`PO ${poId} marked as Partially-Received`);
    }
  }

  // Close MRV
  mrv.status = "close";
  await mrv.save();

  res.status(201).json({
    status: 'success',
    message: 'Successfully submitted!'
  });
});

*/}

// new submitMrv with MRV capturing and execc amount allowed for few partNO
exports.submitMrv = catchAsync(async (req, res, next) => {

  // Define allowed parts that can exceed up to 5%
  const ALLOWED_EXCESS_PARTS = [
    '20634', '20635', '20636', '20637', '20638',
    '20639', '21766', '23470', '23471', '23472'
  ];

  // Convert MRV ID to ObjectId
  const mrvId = new mongoose.Types.ObjectId(req.body.mrvId);
  console.log('mrvIDDDD', mrvId);
  console.log('mrvIDDDDtypeeeeoffff', typeof mrvId);

  const items = req.body.items;

  // Fetch MRV document
  const mrv = await Mrv.findById(mrvId);
  if (!mrv) {
    return next(new AppError('No MRV found for this ID', 404));
  }

  const poIdsToCheck = new Set();

  for (const item of items) {
    let doc = await Item.findById(item.id);

    if (!doc || doc.status === "recived") {
      console.log("Skipping item as it is already received", item);
      continue;
    }

    // ===== ✅ BACKEND VALIDATION FOR EXCESS QTY (NEW) =====
    const partNo = doc.inventory?.masterItem?.partNo?.toString();
    const approveQty = Number(item.approveQty || doc.approveQty);
    const receivedQty = Number(item.recivedQty);
    const damageQty = Number(item.damageQty || 0);

    // Default eligible qty
    let maxEligibleQty = approveQty - damageQty;

    // Allow +5% only for allowed parts
    if (ALLOWED_EXCESS_PARTS.includes(partNo)) {
      maxEligibleQty = approveQty + (approveQty * 0.05);
    }

    // Validation check
    if (receivedQty > maxEligibleQty) {
      return next(
        new AppError(
          `Received quantity (${receivedQty}) exceeds allowed limit (${maxEligibleQty.toFixed(2)}) for part ${partNo}.`,
          400
        )
      );
    }

    if (receivedQty < 0) {
      return next(new AppError(`Received quantity cannot be negative for part ${partNo}.`, 400));
    }

    if (damageQty > approveQty) {
      return next(new AppError(`Damage quantity cannot exceed approved qty for part ${partNo}.`, 400));
    }
    // ===== END VALIDATION =====

    // Store original status before updating
    const originalStatus = doc.status;

    // Safely get PO ID (string or ObjectId)
    const POId = doc.po?._id ? doc.po._id.toString() : doc.po?.toString();
    if (POId) poIdsToCheck.add(POId);

    const fullyReceived =
      Number(item.damageQty || 0) +
      Number(item.recivedQty || 0) >=
      Number(item.approveQty);

    // Update item with received quantities and MRV reference
    doc = await Item.findByIdAndUpdate(
      item.id,
      {
        status: "recived",
        qtyRecived: Number(item.recivedQty),
        damageQty: Number(item.damageQty),
        mrv: mrvId,
        remark: item.remark || "",  // <- store remark
      },
      { new: true }
    );

    // Update PurchaseOrder's specific item with MRV reference
    if (POId) {
      const po = await PurchaseOrder.findById(POId);
      if (po && Array.isArray(po.items)) {
        const index = po.items.findIndex(
          (i) => i.partNo === doc.inventory?.masterItem?.partNo
        );
        if (index !== -1) {
          po.items[index].mrv = mrvId;
          await po.save();
        }
      }
    }

    // Handle partially received items
    if (!fullyReceived) {
      const remain =
        Number(item.approveQty) -
        (Number(item.recivedQty) + Number(item.damageQty));

      const {
        user,
        store,
        inventory,
        requisitionNo,
        approvedByAdmin,
        approvedBySuperAdmin,
        adminApprovedAt,
        superAdminApprovedAt,
      } = doc;

      if (remain > 0) {

      await Item.create({
        user,
        store,
        inventory,
        requisitionNo,
        approveQty: remain,
        qtyRequired: remain,
        flag: "remain",
        status: originalStatus,
        poStatus: "generated",
        po: POId,

        // ✅ Carry Forward Approval Data
        approvedByAdmin: approvedByAdmin || null,
        approvedBySuperAdmin: approvedBySuperAdmin || null,
        adminApprovedAt: adminApprovedAt || null,
        superAdminApprovedAt: superAdminApprovedAt || null,
      });
    }
    }

    // Update inventory
    const inventory = await Inventory.findById(doc.inventory._id);
    if (!inventory) {
      return next(new AppError("No inventory found for this item", 404));
    }

    inventory.reciveQty = Number(item.recivedQty);
    inventory.totalRecive += Number(item.recivedQty);
    inventory.currentStock += Number(item.recivedQty);
    inventory.damage += Number(item.damageQty);

    await inventory.save();
  }

  // Update PurchaseOrder status
  for (const poId of poIdsToCheck) {
    const remaining = await Item.find({
      po: poId,
      status: { $ne: "recived" },
    });

    if (remaining.length === 0) {
      await PurchaseOrder.findByIdAndUpdate(poId, {
        status: "Order-Received",
        billingStatus: "start",
      });
      console.log(`PO ${poId} marked as Order-Received`);
    } else {
      await PurchaseOrder.findByIdAndUpdate(poId, {
        status: "Partially-Received",
      });
      console.log(`PO ${poId} marked as Partially-Received`);
    }
  }

  // Close MRV
  mrv.status = "close";
  await mrv.save();

  res.status(201).json({
    status: "success",
    message: "Successfully submitted!",
  });
});


// localmrvsubmit new

exports.submitMrvLocal = catchAsync(async (req, res, next) => {
  console.log("bodyItem", req.body);

  // Validate MRV ID
  if (!mongoose.Types.ObjectId.isValid(req.body.mrvId)) {
    return next(new AppError("Invalid MRV ID", 400));
  }

  const mrvId = new mongoose.Types.ObjectId(req.body.mrvId);

  const items = req.body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return next(new AppError("Items are required", 400));
  }

  // Fetch MRV document
  const mrv = await Mrv.findById(mrvId);
  if (!mrv) {
    return next(new AppError("No MRV found for this ID", 404));
  }

  for (const item of items) {

    let doc = await Item.findById(item.id);

    if (!doc || doc.status === "recived") {
      console.log("Skipping item as it is already received", item);
      continue;
    }

    // Safe numeric conversions
    const approveQty = Number(item.approveQty || doc.approveQty);
    const receivedQty = Number(item.recivedQty || 0);
    const damageQty = Number(item.damageQty || 0);

    // Basic validation
    if (receivedQty < 0) {
      return next(new AppError("Received quantity cannot be negative", 400));
    }

    if (damageQty < 0) {
      return next(new AppError("Damage quantity cannot be negative", 400));
    }

    if (damageQty > approveQty) {
      return next(new AppError("Damage quantity cannot exceed approved quantity", 400));
    }

    if (receivedQty + damageQty > approveQty) {
      return next(new AppError("Total received + damage exceeds approved quantity", 400));
    }

    // Store original status
    const originalStatus = doc.status;

    // Determine if fully received
    const fullyReceived = (receivedQty + damageQty) >= approveQty;

    // Update original item
    doc = await Item.findByIdAndUpdate(
      item.id,
      {
        status: "recived",
        qtyRecived: receivedQty,
        damageQty: damageQty,
        mrv: mrvId
      },
      { new: true }
    );

    // Handle partially received items (create remain)
    if (!fullyReceived) {

      const remain = approveQty - (receivedQty + damageQty);

      if (remain > 0) {

        const {
          user,
          store,
          inventory,
          requisitionNo,
          approvedByAdmin,
          approvedBySuperAdmin,
          adminApprovedAt,
          superAdminApprovedAt
        } = doc;

        await Item.create({
          user,
          store,
          inventory,
          requisitionNo,
          approveQty: remain,
          qtyRequired: remain,
          flag: "remain",
          status: originalStatus,

          // Carry forward approvals
          approvedByAdmin: approvedByAdmin || null,
          approvedBySuperAdmin: approvedBySuperAdmin || null,
          adminApprovedAt: adminApprovedAt || null,
          superAdminApprovedAt: superAdminApprovedAt || null
        });
      }
    }

    // Update inventory
    const inventoryDoc = await Inventory.findById(doc.inventory._id);
    if (!inventoryDoc) {
      return next(new AppError("No inventory found for this item", 404));
    }

    inventoryDoc.reciveQty = receivedQty;
    inventoryDoc.totalRecive += receivedQty;
    inventoryDoc.currentStock += receivedQty;
    inventoryDoc.damage += damageQty;

    await inventoryDoc.save();
  }

  // Close MRV
  mrv.status = "close";
  await mrv.save();

  res.status(201).json({
    status: "success",
    message: "Successfully submitted Local MRV!"
  });
});


// Controller: get MRVs by multiple billing numbers with actual requisition numbers
exports.getMrvByMultipleBillingNos = catchAsync(async (req, res, next) => {
  const { billingNos } = req.body;

  if (!billingNos || !Array.isArray(billingNos) || billingNos.length === 0) {
    return next(new AppError('Please provide an array of billing numbers', 400));
  }

  // Fetch MRVs for given billing numbers
  const billWithMrvs = await Mrv.find({ billingNo: { $in: billingNos } });

  if (!billWithMrvs.length) {
    return next(new AppError('No MRV records found for the given billing numbers', 404));
  }

  // Fetch related requisition numbers from Items and populate the number
  const billWithMrvsAndReqNos = await Promise.all(
    billWithMrvs.map(async (mrv) => {
      const items = await Item.find({ mrv: mrv._id })
        .populate({ path: 'requisitionNo', select: 'requisitionNo -_id' }); // populate number only

      const requisitionNumbers = items.map(
        (item) => item.requisitionNo?.requisitionNo
      );

      return {
        ...mrv.toObject(),
        requisitionNumbers,
      };
    })
  );

  res.status(200).json({
    status: 'success',
    count: billWithMrvsAndReqNos.length,
    data: billWithMrvsAndReqNos,
  });
});




exports.getSingleMrv = factory.getAll(Mrv);

exports.updateRequestItem = catchAsync(async (req, res, next) => {
  console.log(req.body)
  let body = {}
  if (req.user.role !== 'admin') {
    body = req.body
  } else {
    body.status = 'submit'
  }

  console.log("b9d", body)
  const doc = await Request.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });

  console.log("res", doc)
  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });

});
exports.deleteInventroyItem = factory.deleteOne(Request);

exports.deleteMrv = factory.deleteOne(Mrv)


// ✅ Update MRV details
exports.updateMrv = catchAsync(async (req, res, next) => {
  const mrvId = req.params.id;
  console.log("mrvbodyyyyy", req.body)

  // If a new image is uploaded, sharp middleware already saved it & set req.body.fileName
  if (req.file) {
    req.body.image = req.body.fileName;
  }

  // Always set user from logged-in user
  req.body.user = req.user._id;

  // Find and update MRV
  const updatedMrv = await Mrv.findByIdAndUpdate(mrvId, req.body, {
    new: true,          // return updated document
    runValidators: true // enforce schema validations
  });

  if (!updatedMrv) {
    return next(new AppError('No MRV found with that ID', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      mrv: updatedMrv
    }
  });
});


exports.submitTransferMrv = catchAsync(async (req, res, next) => {
  console.log(req.body)

  const mrvId = req.body.mrvId;
  const items = req.body.items;

  const mrv = await Mrv.findById(mrvId)
  if (!mrv) {

    return next(new AppError('No Mrv found for this Id', 404));

  }
  for (const item of items) {
    let doc;

    if ((Number(item.damageQty) + Number(item.recived)) <= item.approvedTransfer) {
      console.log("if ", item)
      doc = await TransferItem.findByIdAndUpdate(item.id, { status: "recived", recived: Number(item.recived), damageQty: Number(item.damageQty), mrv: mrvId })

    } else {
      return next(new AppError('please fill properly', 404))
    }

    // Now find the related inventory and update it
    const inventory = await Inventory.findById(doc.inventory._id);

    console.log("inventory", inventory)
    if (!inventory) {
      return next(new AppError('No inventory found for this item', 404));
    }

    let inventorySend = await Inventory.findOne({ store: doc.to, masterItem: inventory.masterItem._id })

    console.log("to", inventorySend)

    if (!inventorySend) {
      // return next(new AppError('Store dont have this inventory', 404));
      inventorySend = await Inventory.create({
        masterItem: inventory.masterItem._id,
        store: doc.to,
        user: req.user,
        qtyAuth: item.recived,
        criticalStockQty: 0,
        reqestedQty: 0,
        reciveQty: 0,
        damage: 0,
        totalRecive: 0,
        transfer: 0,
        currentStock: 0,
        totalMiv: 0,
        lp: 0,
        remark: "Genrated at the time of recived Transfer"
      })
    }
    console.log("newinv", inventorySend)
    inventorySend.reciveQty = item.recived;  // Add received quantity to current stock
    inventorySend.totalRecive += item.recived;   // Update the total received quantity
    // inventory.reqestedQty = item.transferQty;
    inventorySend.currentStock += item.recived;
    inventorySend.damage += item.damageQty



    // // You can update other fields like `lp`, `totalMiv`, etc. here if needed

    await inventorySend.save();

    inventory.transfer += item.recived + item.damageQty
    inventory.currentStock -= item.recived + item.damageQty

    await inventory.save();
  }
  mrv.status = "close"
  await mrv.save()
  res.status(201).json({
    status: 'success',
    message: 'successfully submited !'
  });

})
