
const { generateReport } = require("../utils/reportBuilder");
const Request = require('../models/requestedModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const Inventory = require('../models/inventoryModel');
const Item = require('../models/itemModel');
const PurchaseOrder = require('../models/PurchaseOrder');

const formatDate = (date) => {
  if (!date) return "";

  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

const AppError = require('../utils/appError');
const multer = require('multer');
const sharp = require('sharp');


const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/img/requisitionform');
  },
  filename: (req, file, cb) => {
    const ext = file.mimetype.split('/')[1];
    cb(null, `product-${Date.now()}.${ext}`);
  }
});
// const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {

  if (file.mimetype.startsWith('image')) {
    console.log(file)
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

exports.uploadProductPhoto = upload.single('image');

exports.resizeProductPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(); // If no file is uploaded, skip this middleware

  const ext = 'jpeg'; // Convert the image format to jpeg
  const filename = `product-${Date.now()}.${ext}`; // Generate a new filename for the resized image

  // Use sharp to resize the image from the path
  await sharp(req.file.path)
    .resize(500, 500)
    .toFormat(ext)
    .jpeg({ quality: 90 })
    .toFile(`public/img/requisitionform/${filename}`); // Save the resized image to disk

  req.body.fileName = filename; // Store the new filename in req.body.image for further processing

  next(); // Proceed to the next middleware
});


exports.createItem = catchAsync(async (req, res, next) => {

  console.log('req', req.body)
  const inventory = await Inventory.findById(req.body.inventory);

  if (req.body.status) {
    return next(new AppError('This route is not for Status Change !'))
  }
  if (req.body.qtyRequired > inventory.qtyAuth - inventory.currentStock) {
    console.log("check1")
    return next(new AppError('Qty required should be less then AuthQty'))
  }
  req.body.user = req.user._id;
  req.body.requisitionNo = req.body.requisitionNo
  console.log(req.body)

  const doc = await Item.create(req.body);
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
{/* old one where boss and statu add not added
exports.getAllItem = catchAsync(async (req, res, next) => {
  const user = req.user;
  let filter = {};

  const reqNo = req.query.reqNo;
  const store = req.query.store;
  const status = req.query.status;
  const poStatus = req.query.poStatus;

  const statusArray = ['local']; // always include 'local'

  if (status && status !== 'undefined') {
    statusArray.push(status); // add status from frontend
  }

  // Add requisitionNo filter if provided
  if (reqNo && reqNo !== "undefined") {
    filter.requisitionNo = reqNo;
  }

  // Apply OR condition for status and 'local'
  filter.status = { $in: statusArray };

  // Add store filter if provided
  if (store && store !== "undefined") {
    filter.store = store;
  }

  // Add poStatus filter if provided
  if (poStatus && poStatus !== "undefined") {
    filter.poStatus = poStatus;
  }

  const doc = await Item.find(filter);

  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
});

*/}

exports.getAllItem = catchAsync(async (req, res, next) => {
  const user = req.user;
  let filter = {};

  const reqNo = req.query.reqNo;
  const store = req.query.store;
  const status = req.query.status;
  const poStatus = req.query.poStatus;

  // ===================================
  // ✅ STATUS FILTER LOGIC (SAFE)
  // ===================================
  if (status && status !== "undefined") {

    if (status === "all") {
      // 👉 Boss view (all relevant statuses)
      filter.status = {
        $in: [
          'approvedBySuperAdmin',
          'local',
          'tranfer request',
          'rejected'
        ]
      };
    } else {
      // 👉 OLD LOGIC (preserved)
      filter.status = {
        $in: ['local', status]
      };
    }

  } else {
    // 👉 DEFAULT SAFE FALLBACK (OLD BEHAVIOR)
    filter.status = {
      $in: ['local']
    };
  }

  // ===================================
  // OTHER FILTERS
  // ===================================

  if (reqNo && reqNo !== "undefined") {
    filter.requisitionNo = reqNo;
  }

  if (store && store !== "undefined") {
    filter.store = store;
  }

  if (poStatus && poStatus !== "undefined") {
    filter.poStatus = poStatus;
  }

  // ===================================
  // FETCH DATA
  // ===================================
  const doc = await Item.find(filter);

  res.status(200).json({
    status: 'success',
    data: {
      data: doc
    }
  });
});


// this function for item to show for modifcation/reject for admin
exports.getAllItemforApproval = catchAsync(async (req, res, next) => {

  const user = req.user;
  let filter = {};


  // Only include filters with valid values
  const requisitionNo = req.query.reqNo;
  const status = "approved";
  const poStatus = 'pending';

  console.log("test req", requisitionNo)

  const requsition = await Request.findOne({ requisitionNo: requisitionNo })

  if (!requsition) {
    return next(new AppError('No Requsition found with that no', 404));
  }

  console.log(requsition._id, status)
  const doc = await Item.find({ requisitionNo: requsition._id, status: status, poStatus })
  if (!doc) {
    return next(new AppError('No Approved item available', 404));
  }

  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
})

exports.getInventoryItem = factory.getAll(Item);

{/* only 2 approval one admin and second superAdmin
exports.updateRequestItem = catchAsync(async (req, res, next) => {
  const user = req.user;
  let body = {};

  if (user.role === 'storeKeeper') {
    body.approveQty = req.body.approveQty;
    body.status = req.body.status;
    body.qtyRecived = req.body.qtyRecived;
    body.recivedDate = req.body.recivedDate;
    body.recivedBy = req.body.recivedBy;
    body.mrv = req.body.mrv;
  } else {
    body = req.body;
  }

  // ===================================
// 👤 CAPTURE APPROVER & APPROVAL DATE
// ===================================

// ADMIN (approve OR reject)
if (
  (body.status === 'approvedByAdmin' || body.status === 'rejected') &&
  user.role === 'admin'
) {
  body.approvedByAdmin = user._id;
  body.adminApprovedAt = new Date();
}

// SUPER ADMIN (final approve / local / reject)
if (
  (body.status === 'approved' ||
   body.status === 'local' ||
   body.status === 'rejected') &&
  user.role === 'superAdmin'
) {
  body.approvedBySuperAdmin = user._id;
  body.superAdminApprovedAt = new Date();
}


  const existingItem = await Item.findById(req.params.id);
  const inventory = await Inventory.findById(existingItem.inventory._id);
  const requisitionId = existingItem.requisitionNo._id;

  // Additional update for 'local' status
  if (body.status === 'local') {
    body.poStatus = 'generated';
  }

  // 🔄 Update item
  const updatedItem = await Item.findByIdAndUpdate(req.params.id, body, {
    new: true,
    runValidators: true
  });

  if (!updatedItem) {
    return next(new AppError('No item found with that ID', 404));
  }

  // Requisition status updates
  if (body.status === 'approvedByAdmin') {
    const pendingItems = await Item.find({ requisitionNo: requisitionId, status: 'pending' });
    if (pendingItems.length === 0) {
      await Request.findByIdAndUpdate(requisitionId, { status: 'adminSubmit' });
    }
  }

  else if (body.status === 'rejected') {
    const checkStatus = user.role === 'admin' ? 'pending' : 'approvedByAdmin';
    const remainingItems = await Item.find({ requisitionNo: requisitionId, status: checkStatus });
    if (remainingItems.length === 0) {
      await Request.findByIdAndUpdate(requisitionId, {
        status: user.role === 'admin' ? 'adminSubmit' : 'PO Pending'
      });
    }
  }

  else if (body.status === 'local') {
    console.log("🟡 Local status logic triggered");

    const totalItemsCount = await Item.countDocuments({ requisitionNo: requisitionId });
    const localItemCount = await Item.countDocuments({ requisitionNo: requisitionId, status: 'local' });

    if (totalItemsCount === 1 && localItemCount === 1) {
      await Request.findByIdAndUpdate(requisitionId, { status: 'close' });
    } else {
      const finalStatuses = ['autoclosed', 'forceclosed', 'tranfer request', 'local', 'rejected'];
      const closeStatusCount = await Item.countDocuments({
        requisitionNo: requisitionId,
        status: { $in: finalStatuses }
      });

      if (closeStatusCount === totalItemsCount) {
        await Request.findByIdAndUpdate(requisitionId, { status: 'close' });
      }
    }
  }

  // ✅ Final PO Pending logic: only after all approvedByAdmin items are processed
  const unprocessed = await Item.countDocuments({
    requisitionNo: requisitionId,
    status: 'approvedByAdmin'
  });

  if (unprocessed === 0) {
    const hasApproved = await Item.exists({
      requisitionNo: requisitionId,
      status: 'approved'
    });

    if (hasApproved) {
      await Request.findByIdAndUpdate(requisitionId, { status: 'PO Pending' });
    }
  }

  // ✅ Final close check
  const total = await Item.countDocuments({ requisitionNo: requisitionId });
  const closeCount = await Item.countDocuments({
    requisitionNo: requisitionId,
    status: { $in: ['autoclosed', 'forceclosed', 'tranfer request', 'local', 'rejected'] }
  });

  if (total > 0 && total === closeCount) {
    await Request.findByIdAndUpdate(requisitionId, { status: 'close' });
  }

  res.status(201).json({
    status: 'success',
    data: {
      item: updatedItem
    }
  });
});
*/
}

exports.updateRequestItem = catchAsync(async (req, res, next) => {
  const user = req.user;
  let body = {};

  // ===================================
  // ROLE BASED BODY CONTROL
  // ===================================
  if (user.role === 'storeKeeper') {
    body.approveQty = req.body.approveQty;
    body.status = req.body.status;
    body.qtyRecived = req.body.qtyRecived;
    body.recivedDate = req.body.recivedDate;
    body.recivedBy = req.body.recivedBy;
    body.mrv = req.body.mrv;
  } else {
    body = req.body;
  }

  // ===================================
  // GET EXISTING ITEM
  // ===================================
  const existingItem = await Item.findById(req.params.id);
  if (!existingItem) {
    return next(new AppError('No item found with that ID', 404));
  }

  const requisitionId =
    existingItem.requisitionNo._id || existingItem.requisitionNo;

  // ===================================
  // 👤 CAPTURE APPROVER & APPROVAL DATE
  // ===================================

  // ADMIN
  if (
    user.role === 'admin' &&
    (body.status === 'approvedByAdmin' || body.status === 'rejected')
  ) {
    body.approvedByAdmin = user._id;
    body.adminApprovedAt = new Date();
  }

  // SUPER ADMIN
  if (
    user.role === 'superAdmin' &&
    (
      body.status === 'approvedBySuperAdmin' ||
      body.status === 'local' ||
      body.status === 'tranfer request' ||
      body.status === 'rejected'
    )
  ) {
    body.approvedBySuperAdmin = user._id;
    body.superAdminApprovedAt = new Date();

    // ✅ ONLY poStatus update (NO status change)
    body.poStatus = 'waitingForBoss';
  }

  // ===================================
  // ✅ SUPER BOSS (NEW LOGIC ADDED)
  // ===================================
  if (user.role === 'director') {

    // FROM approvedBySuperAdmin → approved
    if (body.status === 'approvedBySuperAdmin') {
      body.status = 'approved';
      body.poStatus = 'pending';
    }

    // LOCAL
    else if (body.status === 'local') {
      body.status = 'local';
      body.poStatus = 'generated';
    }

    // TRANSFER
    else if (body.status === 'tranfer request') {
      body.poStatus = 'pending';
    }

    // REJECT
    else if (body.status === 'rejected') {
      body.poStatus = 'pending';
    }

    body.approvedByBoss = user._id;
    body.bossApprovedAt = new Date();
  }

  // ===================================
  // 🔄 UPDATE ITEM
  // ===================================
  const updatedItem = await Item.findByIdAndUpdate(
    req.params.id,
    body,
    {
      new: true,
      runValidators: true
    }
  );

  // ===================================
  // ✅ ADMIN → REQUEST STATUS
  // ===================================
  if (body.status === 'approvedByAdmin') {
    const pendingItems = await Item.countDocuments({
      requisitionNo: requisitionId,
      status: 'pending'
    });

    if (pendingItems === 0) {
      await Request.findByIdAndUpdate(requisitionId, {
        status: 'adminSubmit'
      });
    }
  }

  // ===================================
  // ✅ SUPER ADMIN → REQUEST STATUS
  // ===================================
  if (user.role === 'superAdmin') {

    const totalItems = await Item.countDocuments({
      requisitionNo: requisitionId
    });

    const processedStatuses = [
      'approvedBySuperAdmin',
      'local',
      'tranfer request',
      'rejected'
    ];

    const processedCount = await Item.countDocuments({
      requisitionNo: requisitionId,
      status: { $in: processedStatuses }
    });

    if (processedCount === totalItems) {
      await Request.findByIdAndUpdate(requisitionId, {
        status: 'pendingWithBoss'
      });
    }
  }

  // ===================================
  // ✅ SUPER BOSS → REQUEST STATUS (NEW)
  // ===================================
  if (user.role === 'director') {

    // ✅ STEP 1: check pending items using poStatus
    const pendingItems = await Item.countDocuments({
      requisitionNo: requisitionId,
      poStatus: 'waitingForBoss'
    });

    // ✅ STEP 2: only update when ALL items processed
    if (pendingItems === 0) {

      // ✅ STEP 3: check if any approved item exists
      const hasApproved = await Item.exists({
        requisitionNo: requisitionId,
        status: 'approved'
      });

      await Request.findByIdAndUpdate(requisitionId, {
        status: hasApproved ? 'PO Pending' : 'close'
      });

    }
  }

  // ===================================
  // ✅ RESPONSE
  // ===================================
  res.status(200).json({
    status: 'success',
    data: {
      item: updatedItem
    }
  });
});


//bypass by the director
exports.bypassByRequisitionStatus = catchAsync(async (req, res, next) => {
  const user = req.user;
  const { action, requisitionStatus, remark, actionType } = req.body;

  const existingItem = await Item.findById(req.params.id);

  if (!existingItem) {
    return next(new AppError("No item found with that ID", 404));
  }

  const requisitionId =
    existingItem.requisitionNo._id || existingItem.requisitionNo;

  // ===================================
  // 🟢 STAGE 1 → ADMIN (submit)
  // ===================================
  if (requisitionStatus === "submit") {
    const requestDoc = await Request.findById(requisitionId);

    if (!requestDoc || requestDoc.status !== "submit") {
      return next(new AppError("Invalid requisition stage", 400));
    }

    if (actionType === "selected") {
      // ❌ Reject Selected
      const selectedItems = await Item.find({
        _id: { $in: req.body.itemIds },
        status: { $in: ["pending", "open"] }
      });

      if (!selectedItems.length) {
        return next(new AppError("No selected items found", 400));
      }

      await Promise.all(
        selectedItems.map(item =>
          Item.findByIdAndUpdate(item._id, {
            $set: {
              status: "rejected",
              adminRemark: remark || "Rejected",
              approvedByAdmin: user._id,
              adminApprovedAt: new Date()
            }
          })
        )
      );

      // ✅ Approve Remaining
      const remainingItems = await Item.find({
        requisitionNo: requisitionId,
        status: { $in: ["pending", "open"] }
      });

      await Promise.all(
        remainingItems.map(item =>
          Item.findByIdAndUpdate(item._id, {
            $set: {
              status: "approvedByAdmin",
              adminRemark: "approved",
              approveQty: item.qtyRequired,
              approvedByAdmin: user._id,
              adminApprovedAt: new Date()
            }
          })
        )
      );
    } else {
      // 🔁 Bulk Approve / Reject
      const items = await Item.find({
        requisitionNo: requisitionId,
        status: { $in: ["pending", "open"] }
      });

      if (!items.length) {
        return next(new AppError("No items to process", 400));
      }

      await Promise.all(
        items.map(item => {
          const updateBody = {};

          if (action === "approve") {
            updateBody.status = "approvedByAdmin";
            updateBody.adminRemark = "approved";
            updateBody.approveQty = item.qtyRequired;
          }

          if (action === "reject") {
            updateBody.status = "rejected";
            updateBody.adminRemark = remark || "Rejected";
          }

          updateBody.approvedByAdmin = user._id;
          updateBody.adminApprovedAt = new Date();

          return Item.findByIdAndUpdate(item._id, { $set: updateBody });
        })
      );
    }

    const remainingPending = await Item.countDocuments({
      requisitionNo: requisitionId,
      status: { $in: ["pending", "open"] }
    });

    if (remainingPending === 0) {
      await Request.findByIdAndUpdate(requisitionId, {
        status: "adminSubmit"
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Submit stage processed successfully"
    });
  }

  // ===================================
  // 🟡 STAGE 2 → SUPER ADMIN (adminSubmit)
  // ===================================
  if (requisitionStatus === "adminSubmit") {
    const requestDoc = await Request.findById(requisitionId);

    if (!requestDoc || requestDoc.status !== "adminSubmit") {
      return next(new AppError("Invalid requisition stage", 400));
    }

    if (actionType === "selected") {
      const selectedItems = await Item.find({
        _id: { $in: req.body.itemIds },
        status: "approvedByAdmin"
      });

      if (!selectedItems.length) {
        return next(new AppError("No selected items found", 400));
      }

      // ❌ Reject Selected
      await Promise.all(
        selectedItems.map(item =>
          Item.findByIdAndUpdate(item._id, {
            $set: {
              status: "rejected",
              adminRemark: remark || "Rejected",
              approvedBySuperAdmin: user._id,
              superAdminApprovedAt: new Date()
            }
          })
        )
      );

      // ✅ Approve Remaining
      const remainingItems = await Item.find({
        requisitionNo: requisitionId,
        status: "approvedByAdmin"
      });

      await Promise.all(
        remainingItems.map(item =>
          Item.findByIdAndUpdate(item._id, {
            $set: {
              status: "approvedBySuperAdmin",
              approvedBySuperAdmin: user._id,
              superAdminApprovedAt: new Date(),
              poStatus: "waitingForBoss"
            }
          })
        )
      );
    } else {
      const items = await Item.find({
        requisitionNo: requisitionId,
        status: "approvedByAdmin"
      });

      if (!items.length) {
        return next(new AppError("No items to process", 400));
      }

      await Promise.all(
        items.map(item => {
          const updateBody = {};

          if (action === "approve") {
            updateBody.status = "approvedBySuperAdmin";
            updateBody.poStatus = "waitingForBoss";
          }

          if (action === "reject") {
            updateBody.status = "rejected";
            updateBody.adminRemark = remark || "Rejected";
          }

          updateBody.approvedBySuperAdmin = user._id;
          updateBody.superAdminApprovedAt = new Date();

          return Item.findByIdAndUpdate(item._id, { $set: updateBody });
        })
      );
    }

    await Request.findByIdAndUpdate(requisitionId, {
      status: "pendingWithBoss"
    });

    return res.status(200).json({
      status: "success",
      message: "AdminSubmit stage processed successfully"
    });
  }

  // ===================================
  // 🔴 STAGE 3 → DIRECTOR
  // ===================================
  if (requisitionStatus === "pendingWithBoss") {
    const requestDoc = await Request.findById(requisitionId);

    if (!requestDoc || requestDoc.status !== "pendingWithBoss") {
      return next(new AppError("Invalid requisition stage", 400));
    }

    const items = await Item.find({
      requisitionNo: requisitionId
    });

    if (!items.length) {
      return next(new AppError("No items found", 400));
    }

    // ===================================
    // ✅ Selected
    // ===================================
    if (actionType === "selected") {
      // ❌ Reject Selected
      await Promise.all(
        items
          .filter(item => req.body.itemIds.includes(item._id.toString()))
          .map(item =>
            Item.findByIdAndUpdate(item._id, {
              $set: {
                status: "rejected",
                adminRemark: remark || "Rejected",
                approvedByBoss: user._id,
                bossApprovedAt: new Date()
              }
            })
          )
      );

      // ✅ Approve Remaining
      await Promise.all(
        items
          .filter(item => !req.body.itemIds.includes(item._id.toString()))
          .map(item => {
            const updateBody = {};

            if (item.status === "approvedBySuperAdmin") {
              updateBody.status = "approved";
              updateBody.poStatus = "pending";
            } else if (item.status === "local") {
              updateBody.status = "local";
              updateBody.poStatus = "generated";
            } else {
              updateBody.poStatus = "pending";
            }

            updateBody.approvedByBoss = user._id;
            updateBody.bossApprovedAt = new Date();

            return Item.findByIdAndUpdate(item._id, {
              $set: updateBody
            });
          })
      );
    } else {
      // ===================================
      // 🔁 Bulk Approve / Reject
      // ===================================
      await Promise.all(
        items.map(item => {
          const updateBody = {};

          if (action === "reject") {
            updateBody.status = "rejected";
            updateBody.adminRemark = remark || "Rejected";
          }

          if (action === "approve") {
            if (item.status === "approvedBySuperAdmin") {
              updateBody.status = "approved";
              updateBody.poStatus = "pending";
            } else if (item.status === "local") {
              updateBody.status = "local";
              updateBody.poStatus = "generated";
            } else {
              updateBody.poStatus = "pending";
            }
          }

          updateBody.approvedByBoss = user._id;
          updateBody.bossApprovedAt = new Date();

          return Item.findByIdAndUpdate(item._id, {
            $set: updateBody
          });
        })
      );
    }

    // ===================================
    // ✅ Final Request Status Logic
    // ===================================
    const hasApprovedBySuperAdmin = await Item.exists({
      requisitionNo: requisitionId,
      status: "approvedBySuperAdmin"
    });

    const hasApproved = await Item.exists({
      requisitionNo: requisitionId,
      status: { $in: ["approved", "local"] }
    });

    if (!hasApprovedBySuperAdmin) {
      await Request.findByIdAndUpdate(requisitionId, {
        status: hasApproved ? "PO Pending" : "close"
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Director stage processed successfully"
    });
  }
});

{ /*
exports.bypassByRequisitionStatus1 = catchAsync(async (req, res, next) => {
  const user = req.user;
  const { action, requisitionStatus, remark, actionType } = req.body;

  const existingItem = await Item.findById(req.params.id);
  if (!existingItem) {
    return next(new AppError("No item found with that ID", 404));
  }

  const requisitionId =
    existingItem.requisitionNo._id || existingItem.requisitionNo;

  // ===================================
  // 🟢 STAGE 1 → ADMIN (submit)
  // ===================================
  if (requisitionStatus === "submit") {

    const requestDoc = await Request.findById(requisitionId);
    if (!requestDoc || requestDoc.status !== "submit") {
      return next(new AppError("Invalid requisition stage", 400));
    }

    if (actionType === "selected") {

      // ❗ Reject selected
      const selectedItems = await Item.find({
        _id: { $in: req.body.itemIds },
        status: { $in: ["pending", "open"] }
      });

      if (!selectedItems.length) {
        return next(new AppError("No selected items found", 400));
      }

      await Promise.all(
        selectedItems.map(item =>
          Item.findByIdAndUpdate(item._id, {
            $set: {
              status: "rejected",
              adminRemark: remark || "Rejected",
              approvedByAdmin: user._id,
              adminApprovedAt: new Date(),
            }
          })
        )
      );

      // ✅ APPROVE REMAINING
      const remainingItems = await Item.find({
        requisitionNo: requisitionId,
        status: { $in: ["pending", "open"] }
      });

      await Promise.all(
        remainingItems.map(item =>
          Item.findByIdAndUpdate(item._id, {
            $set: {
              status: "approvedByAdmin",
              adminRemark: "approved",
              approveQty: item.qtyRequired,
              approvedByAdmin: user._id,
              adminApprovedAt: new Date(),
            }
          })
        )
      );

    } else {

      // 🔥 BULK
      const items = await Item.find({
        requisitionNo: requisitionId,
        status: { $in: ["pending", "open"] }
      });

      if (!items.length) {
        return next(new AppError("No items to process", 400));
      }

      await Promise.all(
        items.map(item => {
          const updateBody = {};

          if (action === "approve") {
            updateBody.status = "approvedByAdmin";
            updateBody.adminRemark = "approved";
            updateBody.approveQty = item.qtyRequired;
          }

          if (action === "reject") {
            updateBody.status = "rejected";
            updateBody.adminRemark = remark || "Rejected";
          }

          updateBody.approvedByAdmin = user._id;
          updateBody.adminApprovedAt = new Date();

          return Item.findByIdAndUpdate(item._id, { $set: updateBody });
        })
      );
    }

    // ✅ FINAL STATUS UPDATE
    const remainingPending = await Item.countDocuments({
      requisitionNo: requisitionId,
      status: { $in: ["pending", "open"] },
    });

    if (remainingPending === 0) {
      await Request.findByIdAndUpdate(requisitionId, {
        status: "adminSubmit",
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Submit stage processed successfully",
    });
  }

  // ===================================
  // 🟡 STAGE 2 → SUPER ADMIN (adminSubmit)
  // ===================================
  if (requisitionStatus === "adminSubmit") {

    const requestDoc = await Request.findById(requisitionId);
    if (!requestDoc || requestDoc.status !== "adminSubmit") {
      return next(new AppError("Invalid requisition stage", 400));
    }

    if (actionType === "selected") {

      const selectedItems = await Item.find({
        _id: { $in: req.body.itemIds },
        status: "approvedByAdmin"
      });

      if (!selectedItems.length) {
        return next(new AppError("No selected items found", 400));
      }

      // ❗ FIX: store remark
      await Promise.all(
        selectedItems.map(item =>
          Item.findByIdAndUpdate(item._id, {
            $set: {
              status: "rejected",
              adminRemark: remark || "Rejected",
              approvedBySuperAdmin: user._id,
              superAdminApprovedAt: new Date(),
            }
          })
        )
      );

      // ✅ APPROVE REMAINING
      const remainingItems = await Item.find({
        requisitionNo: requisitionId,
        status: "approvedByAdmin"
      });

      await Promise.all(
        remainingItems.map(item =>
          Item.findByIdAndUpdate(item._id, {
            $set: {
              status: "approvedBySuperAdmin",
              approvedBySuperAdmin: user._id,
              superAdminApprovedAt: new Date(),
              poStatus: "waitingForBoss"
            }
          })
        )
      );

    } else {

      const items = await Item.find({
        requisitionNo: requisitionId,
        status: "approvedByAdmin"
      });

      if (!items.length) {
        return next(new AppError("No items to process", 400));
      }

      await Promise.all(
        items.map(item => {
          const updateBody = {};

          if (action === "approve") {
            updateBody.status = "approvedBySuperAdmin";
            updateBody.poStatus = "waitingForBoss";
          }

          if (action === "reject") {
            updateBody.status = "rejected";
            updateBody.adminRemark = remark || "Rejected";
          }

          updateBody.approvedBySuperAdmin = user._id;
          updateBody.superAdminApprovedAt = new Date();

          return Item.findByIdAndUpdate(item._id, { $set: updateBody });
        })
      );
    }

    // ✅ MOVE TO NEXT STAGE
    await Request.findByIdAndUpdate(requisitionId, {
      status: "pendingWithBoss"
    });

    return res.status(200).json({
      status: "success",
      message: "AdminSubmit stage processed successfully",
    });
  }

  // ===================================
  // 🔴 STAGE 3 → DIRECTOR
  // ===================================
  if (requisitionStatus === "pendingWithBoss") {

  const requestDoc = await Request.findById(requisitionId);

  if (!requestDoc || requestDoc.status !== "pendingWithBoss") {
    return next(new AppError("Invalid requisition stage", 400));
  }

  const items = await Item.find({
    requisitionNo: requisitionId,
  });

  if (!items.length) {
    return next(new AppError("No items found", 400));
  }

  // ===================================
  // ✅ SELECTED (REJECT SELECTED + AUTO APPROVE REMAINING)
  // ===================================
  if (actionType === "selected") {

    // ❌ REJECT SELECTED
    await Promise.all(
      items
        .filter(item => req.body.itemIds.includes(item._id.toString()))
        .map(item =>
          Item.findByIdAndUpdate(item._id, {
            $set: {
              status: "rejected",
              adminRemark: remark || "Rejected",
              approvedByBoss: user._id,
              bossApprovedAt: new Date(),
            }
          })
        )
    );

    // ✅ PROCESS REMAINING (AUTO APPROVE)
    await Promise.all(
      items
        .filter(item => !req.body.itemIds.includes(item._id.toString()))
        .map(item => {

          const updateBody = {};

          if (item.status === "approvedBySuperAdmin") {
            updateBody.status = "approved";
            updateBody.poStatus = "pending";
          } else if (item.status === "local") {
            updateBody.status = "local";
            updateBody.poStatus = "approved";
          } else {
            updateBody.poStatus = "pending";
          }

          updateBody.approvedByBoss = user._id;
          updateBody.bossApprovedAt = new Date();

          return Item.findByIdAndUpdate(item._id, {
            $set: updateBody
          });
        })
    );

  } else {

    // ===================================
    // 🔁 BULK (APPROVE ALL / REJECT ALL)
    // ===================================
    await Promise.all(
      items.map(item => {

        const updateBody = {};

        // 🔴 REJECT ALL
        if (action === "reject") {
          updateBody.status = "rejected";
          updateBody.adminRemark = remark || "Rejected";
        }

        // 🟢 APPROVE ALL
        if (action === "approve") {

          if (item.status === "approvedBySuperAdmin") {
            updateBody.status = "approved";
            updateBody.poStatus = "pending";
          } else if (item.status === "local") {
            updateBody.status = "local";
            updateBody.poStatus = "approved";
          } else {
            updateBody.poStatus = "pending";
          }
        }

        updateBody.approvedByBoss = user._id;
        updateBody.bossApprovedAt = new Date();

        return Item.findByIdAndUpdate(item._id, {
          $set: updateBody
        });
      })
    );
  }

  // ===================================
  // ✅ FINAL REQUEST STATUS LOGIC
  // ===================================

  const hasApprovedBySuperAdmin = await Item.exists({
    requisitionNo: requisitionId,
    status: "approvedBySuperAdmin",
  });

  const hasApproved = await Item.exists({
    requisitionNo: requisitionId,
    status: "approved",
  });

  if (!hasApprovedBySuperAdmin) {
    await Request.findByIdAndUpdate(requisitionId, {
      status: hasApproved ? "PO Pending" : "close",
    });
  }

  return res.status(200).json({
    status: "success",
    message: "Director stage processed successfully",
  });
}
});
*/}



//bulk director arroval 

exports.bulkApproveByDirector = catchAsync(async (req, res, next) => {

  const user = req.user;

  if (user.role !== 'director') {
    return next(new AppError('You are not authorized to perform this action', 403));
  }

  const { items } = req.body;

  if (!items || items.length === 0) {
    return next(new AppError('Please provide items for bulk update', 400));
  }

  const updatedItems = [];

  for (const obj of items) {

    const { id, status } = obj;

    const existingItem = await Item.findById(id);
    if (!existingItem) continue;

    let body = {};

    const requisitionId =
      existingItem.requisitionNo._id || existingItem.requisitionNo;

    // ===================================
    // 👑 DIRECTOR LOGIC
    // ===================================
    if (user.role === 'director') {

      if (status === 'approvedBySuperAdmin') {
        body.status = 'approved';
        body.poStatus = 'pending';
      }

      else if (status === 'local') {
        body.status = 'local';
        body.poStatus = 'generated'; // initial
      }

      else if (status === 'tranfer request') {
        body.status = status;
        body.poStatus = 'pending';
      }

      else if (status === 'rejected') {
        body.status = status;
        body.poStatus = 'pending';
      }

      else {
        continue;
      }

      body.approvedByBoss = user._id;
      body.bossApprovedAt = new Date();
    }

    // ===================================
    // ✅ FINAL ENFORCEMENT (IMPORTANT)
    // ===================================
    if (body.status === 'local') {
      body.poStatus = 'generated'; // 🔥 ALWAYS FORCE
    }

    // ===================================
    // 🔄 UPDATE ITEM
    // ===================================
    const updatedItem = await Item.findByIdAndUpdate(
      id,
      body,
      {
        new: true,
        runValidators: true
      }
    );

    updatedItems.push({
      item: updatedItem,
      requisitionId: requisitionId.toString()
    });
  }

  // ===================================
  // 📦 REQUEST STATUS UPDATE
  // ===================================
  const uniqueRequisitionIds = [
    ...new Set(updatedItems.map(i => i.requisitionId))
  ];

  for (const requisitionId of uniqueRequisitionIds) {

    const pendingItems = await Item.countDocuments({
      requisitionNo: requisitionId,
      poStatus: 'waitingForBoss'
    });

    if (pendingItems === 0) {

      const hasApproved = await Item.exists({
        requisitionNo: requisitionId,
        status: 'approved'
      });

      await Request.findByIdAndUpdate(requisitionId, {
        status: hasApproved ? 'PO Pending' : 'close'
      });
    }
  }

  res.status(200).json({
    status: 'success',
    message: 'Bulk approval done by Director',
    results: updatedItems.length,
    data: updatedItems
  });

});

exports.updateItemStatusByDirector = catchAsync(async (req, res, next) => {

  const user = req.user;

  // ✅ Allow Director + SuperAdmin
  if (!['director', 'superAdmin'].includes(user.role)) {
    return next(new AppError('You are not authorized', 403));
  }

  const { status } = req.body;

  const allowedStatuses = [
    'approvedBySuperAdmin',
    'local',
    'tranfer request',
    'rejected'
  ];

  if (!status || !allowedStatuses.includes(status)) {
    return next(new AppError('Invalid status value', 400));
  }

  const item = await Item.findById(req.params.id);

  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  // ===================================
  // ❌ BLOCK INVALID STATES (Recommended)
  // ===================================
  if (item.status === 'recived') {
    return next(new AppError('Item already received. Cannot change status', 400));
  }

  if (item.status === 'forceclosed') {
    return next(new AppError('Item is force closed. No changes allowed', 400));
  }

  if (item.status === 'autoclosed') {
    return next(new AppError('Item is auto closed. No changes allowed', 400));
  }

  // ===================================
  // ✅ STORE OLD STATUS
  // ===================================
  const oldStatus = item.status;
  item.previousStatus = oldStatus;

  // ===================================
  // ✅ UPDATE STATUS
  // ===================================
  item.status = status;

  // ===================================
  // 🔥 PO STATUS LOGIC
  // ===================================

  // ✅ if new status is local → generated
  if (status === "local") {
    item.poStatus = "generated";
  }

  // ✅ if changed FROM local → anything else
  else if (oldStatus === "local" && status !== "local") {
    item.poStatus = "pending";
  }

  // ✅ all other cases → pending
  else {
    item.poStatus = "pending";
  }

  // ===================================
  // ✅ ROLE-WISE TRACKING (Optional but clean)
  // ===================================
  if (user.role === 'director') {
    item.approvedByBoss = user._id;
    item.bossApprovedAt = new Date();
  }

  if (user.role === 'superAdmin') {
    item.approvedBySuperAdmin = user._id;
    item.superAdminApprovedAt = new Date();
  }

  await item.save();

  res.status(200).json({
    status: 'success',
    message: `Status updated successfully by ${user.role}`,
    data: { item }
  });

});

exports.updateApproveQtyByDirector = catchAsync(async (req, res, next) => {
  const user = req.user;

  // ✅ Role check (Director + SuperAdmin)
  if (!['director', 'superAdmin'].includes(user.role)) {
    return next(
      new AppError('You are not authorized to update approve quantity', 403)
    );
  }

  let { approveQty } = req.body;

  // ✅ FIRST check raw value
  if (approveQty === undefined || approveQty === null) {
    return next(new AppError('Please provide approve quantity', 400));
  }

  // 🔥 THEN convert
  approveQty = Number(approveQty);

  // ✅ Validate number
  if (isNaN(approveQty)) {
    return next(new AppError('Approve quantity must be a number', 400));
  }

  // ✅ Allow 0, block negative
  if (approveQty < 0) {
    return next(new AppError('Approve quantity cannot be negative', 400));
  }

  // 🔎 Find item
  const item = await Item.findById(req.params.id);

  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  // ===================================
  // ❌ STATUS-WISE VALIDATION
  // ===================================
  if (item.status === 'rejected') {
    return next(
      new AppError('You cannot update approve quantity for rejected items', 400)
    );
  }

  if (item.status === 'recived') {
    return next(
      new AppError('Item already received. Quantity cannot be changed', 400)
    );
  }

  if (item.status === 'forceclosed') {
    return next(
      new AppError('Item is force closed. No further changes allowed', 400)
    );
  }

  if (item.status === 'autoclosed') {
    return next(
      new AppError('Item is auto closed. No further changes allowed', 400)
    );
  }

  // ===================================
  // ✅ SAME VALUE CHECK
  // ===================================
  if (item.approveQty === approveQty) {
    return next(new AppError('Approve quantity is already the same', 400));
  }

  // ===================================
  // ✅ UPDATE LOGIC
  // ===================================
  item.approveQty = approveQty;

  // 🔥 ROLE-WISE TRACKING (using existing schema)
  if (user.role === 'director') {
    item.approvedByBoss = user._id;
    item.bossApprovedAt = new Date();
  }

  if (user.role === 'superAdmin') {
    item.approvedBySuperAdmin = user._id;
    item.superAdminApprovedAt = new Date();
  }

  await item.save();

  res.status(200).json({
    status: 'success',
    message: `Approve quantity updated successfully by ${user.role}`,
    data: { item }
  });
});


exports.cancelRemainingItem = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { poRemark } = req.body;
  const userId = req.user._id;

  // ======================================
  // 1️⃣ FETCH ITEM
  // ======================================
  const item = await Item.findById(id);

  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  // ======================================
  // 2️⃣ BLOCK INVALID STATES
  // ======================================
  const blockedStatuses = [
    'recived',
    'rejected',
    'forceclosed',
    'autoclosed'
  ];

  if (blockedStatuses.includes(item.status)) {
    return next(
      new AppError(`Item already ${item.status}, cannot cancel`, 400)
    );
  }

  // ======================================
  // 3️⃣ CALCULATE REMAINING QTY
  // ======================================
  const approvedQty = Number(item.approveQty || 0);
  const receivedQty = Number(item.qtyRecived || 0);
  const remainingQty = approvedQty - receivedQty;

  if (remainingQty <= 0) {
    return next(
      new AppError('No remaining quantity to cancel', 400)
    );
  }

  // ======================================
  // PO REMARK VALIDATION
  // ======================================
  if (!poRemark?.trim()) {
    return next(
      new AppError(
        'PO Remark is required before cancelling quantity',
        400
      )
    );
  }

  // ======================================
  // 4️⃣ CANCEL REMAINING ITEM
  // ======================================
  item.cancelQty = remainingQty;
  item.cancelledBy = userId;
  item.status = 'supplier_failed';
  item.poRemark = poRemark;

  await item.save();

  // ======================================
  // 5️⃣ CHECK COMPLETE PO STATUS
  // ======================================
  if (item.po) {

    const poItems = await Item.find({
      po: item.po
    });

    const receivedCount = poItems.filter(
      x => x.status === 'recived'
    ).length;

    const pendingCount = poItems.filter(
      x =>
        x.status === 'approved' ||
        x.status === 'pending'
    ).length;

    const supplierFailedCount = poItems.filter(
      x =>
        x.status === 'supplier_failed' ||
        x.status === 'rejected' ||
        x.status === 'forceclosed' ||
        x.status === 'autoclosed'
    ).length;

    let poStatus = null;
    let billingStatus = "";

    // ======================================
    // CASE 1
    // Received + Pending
    // ======================================
    if (
      receivedCount > 0 &&
      pendingCount > 0
    ) {

      poStatus = "Partially-Received";

    }

    // ======================================
    // CASE 2
    // Pending Exists + No Received
    // ======================================
    else if (
      pendingCount > 0 &&
      receivedCount === 0
    ) {

      poStatus = "Confirmed-Generated";

    }

    // ======================================
    // CASE 3
    // No Pending + At Least One Received
    // ======================================
    else if (
      pendingCount === 0 &&
      receivedCount > 0
    ) {

      poStatus = "Order-Received";
      billingStatus = "start";

    }

    // ======================================
    // CASE 4
    // No Pending + No Received
    // ======================================
    else if (
      pendingCount === 0 &&
      receivedCount === 0 &&
      supplierFailedCount > 0
    ) {

      poStatus = "Supplier-Denied";
      billingStatus = "";

    }

    // ======================================
    // UPDATE PO
    // ======================================
    if (poStatus) {

      const poDoc = await PurchaseOrder.findById(item.po);

      await PurchaseOrder.findByIdAndUpdate(
        item.po,
        {
          status: poStatus,
          billingStatus,
          $push: {
            history: {
              action: 'Updated',
              fromStatus:
                poDoc?.status || 'Confirmed-Generated',
              toStatus: poStatus,
              remark: `PO status updated to ${poStatus}. PO Remark: ${poRemark}`,
              user: userId,
              role: req.user.role
            }
          }
        },
        { new: true }
      );

    }
  }

  // ======================================
  // 6️⃣ RESPONSE
  // ======================================
  res.status(200).json({
    status: 'success',
    message: 'Remaining quantity cancelled successfully',
    data: item
  });
});




// Controller to fetch items based on storeId, status, and date range
exports.getItemsByStoreStatusDate = async (req, res) => {
  try {
    // Extract parameters from the request
    const { fromDate, toDate, status } = req.body;

    // Ensure 'fromDate' and 'toDate' are provided, and parse them into Date objects
    const from = fromDate ? new Date(fromDate) : new Date(); // Default to a very early date if not provided
    const to = toDate ? new Date(toDate) : new Date(); // Default to the current date if not provided

    // Validate dates
    if (isNaN(from) || isNaN(to)) {
      return next(new AppError('Invalid Date Formate', 404));
    }

    // Build the query
    const startOfDay = new Date(from).setHours(0, 0, 0, 0); // Start of the day
    const endOfDay = new Date(to).setHours(23, 59, 59, 999); // End of the day

    const query = {
      createdAt: { $gte: new Date(startOfDay), $lte: new Date(endOfDay) }, // Full-day range
      //status: { $in: ["recived", "rejected", "pending"] },
    };

    // Add status condition if it's provided (and not 'all')
    if (status && status !== "all") {
      query.status = status; // Filter by specific status
    }

    // Find items that match the query
    const items = await Item.find(query)
    // Get the total count of records matching the query
    const totalCount = await Item.countDocuments(query);


    // Return the response with the fetched items
    return res.status(200).json({
      status: 'success',
      data: items,
      count: totalCount
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'An error occurred while fetching the items.',
    });
  }
};


exports.getdesileItem = (async (req, res, next) => {

  let filter = {};
  const store = req.query.store;
  const status = req.query.status;

  const inventory = await Inventory.findOne({ store: store, masterItem: "671a11ad0f507b916bff8a9b" })
  // Only include filters with valid values

  if (!inventory) {
    return next(new AppError('No item found with that ID', 404));
  }
  console.log("inventory", inventory)
  // Create a base filter for the user
  // filter.user = user._id;



  // Add status to filter only if it's provided
  if (status && status !== "undefined") {
    filter.status = status;
  }

  // You can also handle the 'store' field similarly, if necessary
  if (store && store !== "undefined") {
    filter.store = store;
  }


  const doc = await Item.find({ inventory: inventory._id, status: filter.status })

  console.log(doc)

  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
})

// Controller to fetch count of items based on storeId, status, and date range
exports.getRequestItemsByStoreStatusDate = async (req, res, next) => {
  try {
    const { fromDate, toDate, status } = req.body;

    const from = fromDate ? new Date(fromDate) : new Date();
    const to = toDate ? new Date(toDate) : new Date();

    if (isNaN(from) || isNaN(to)) {
      return next(new AppError('Invalid Date Format', 400));
    }

    const startOfDay = new Date(from).setHours(0, 0, 0, 0);
    const endOfDay = new Date(to).setHours(23, 59, 59, 999);

    // Aggregation query
    const aggregatedData = await Item.aggregate([
      // Step 1: Match Item documents by date range and status
      {
        $match: {
          createdAt: { $gte: new Date(startOfDay), $lte: new Date(endOfDay) },
          ...(status && { status }), // Optional status filter
        },
      },
      // Step 2: Lookup to join with Inventory data
      {
        $lookup: {
          from: 'inventories', // MongoDB collection name for Inventory
          localField: 'inventory', // Field in Item
          foreignField: '_id', // Field in Inventory
          as: 'inventoryData', // Output array
        },
      },
      // Step 3: Unwind the inventoryData array
      {
        $unwind: {
          path: '$inventoryData',
          preserveNullAndEmptyArrays: false, // Exclude documents without inventoryData
        },
      },
      // Step 4: Lookup to join with Store data
      {
        $lookup: {
          from: 'stores', // MongoDB collection name for Store
          localField: 'store', // Field in Item
          foreignField: '_id', // Field in Store
          as: 'storeData',
        },
      },
      // Step 5: Unwind the storeData array
      {
        $unwind: {
          path: '$storeData',
          preserveNullAndEmptyArrays: false, // Exclude documents without storeData
        },
      },
      // Step 6: Lookup to join with MasterList to get partNo
      {
        $lookup: {
          from: 'masterlists', // MongoDB collection name for MasterList
          localField: 'inventoryData.masterItem', // Field in Inventory
          foreignField: '_id', // Field in MasterList
          as: 'masterItemData',
        },
      },
      // Step 7: Unwind the masterItemData array
      {
        $unwind: {
          path: '$masterItemData',
          preserveNullAndEmptyArrays: false, // Exclude documents without masterItemData
        },
      },
      // Step 8: Lookup to join with Request to get requisition number
      {
        $lookup: {
          from: 'requests', // MongoDB collection name for Request
          localField: 'requisitionNo', // Field in Item
          foreignField: '_id', // Field in Request
          as: 'requestData',
        },
      },
      // Step 9: Unwind the requestData array
      {
        $unwind: {
          path: '$requestData',
          preserveNullAndEmptyArrays: false, // Exclude documents without requestData
        },
      },
      // Step 10: Lookup to join with Mrv to get mrvNo
      {
        $lookup: {
          from: 'mrvs', // MongoDB collection name for Mrv
          localField: 'mrv', // Field in Item
          foreignField: '_id', // Field in Mrv
          as: 'mrvData',
        },
      },
      // Step 11: Unwind the mrvData array
      {
        $unwind: {
          path: '$mrvData',
          preserveNullAndEmptyArrays: true, // Include documents without mrvData
        },
      },
      // Step 12: Group by Store and collect item details
      {
        $group: {
          _id: '$storeData._id', // Group by Store ID
          storeName: { $first: '$storeData.name' }, // Store Name
          location: { $first: '$storeData.location' }, // Store Location
          itemCount: { $sum: 1 }, // Count items
          items: {
            $push: {
              usedItemId: '$_id', // UsedItem ID
              requiredQty: '$qtyRequired', // Required Quantity
              qtyRecived: '$qtyRecived',
              status: '$status', // Item Status
              approveQty: '$approveQty',
              inventoryId: '$inventoryData._id', // Inventory ID
              partNo: '$masterItemData.partNo', // Part Number from MasterList
              description: '$masterItemData.description', // Description from MasterList
              requisitionNo: '$requestData.requisitionNo', // Requisition Number
              mrvNo: '$mrvData.mrvNo', // MRV Number
            },
          },
        },
      },
      // Step 13: Sort by Store Name (optional)
      {
        $sort: { storeName: 1 },
      },
    ]);

    return res.status(200).json({
      status: 'success',
      data: aggregatedData,
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'An error occurred while fetching the items.',
    });
  }
};

//item on basis of requsition id
{/*
exports.getItemsByRequisitionNo = catchAsync(async (req, res, next) => {
  const { requisitionNo } = req.params;

  if (!requisitionNo) {
    return next(new AppError('Requisition number is required.', 400));
  }

  const items = await Item.find({ requisitionNo })
    .sort({ createdAt: -1 })
    .populate({
      path: 'inventory',
      select: '-__v -active -id'
    })
    .populate({
      path: 'po',           // <-- populate PO reference
      select: 'poNumber'    // only poNumber
    })
    .populate({
      path: 'store',
      select: 'name storeCode location'
    })
    .populate({
      path: 'user',
      select: 'name'
    });

  res.status(200).json({
    status: 'success',
    results: items.length,
    data: items,
  });
});

*/}

exports.getItemsByRequisitionNo = catchAsync(async (req, res, next) => {
  const { requisitionNo } = req.params;

  if (!requisitionNo) {
    return next(new AppError('Requisition number is required.', 400));
  }

  const items = await Item.find({ requisitionNo })
    .setOptions({ skipPopulate: true }) // ✅ KEY LINE
    .select('qtyRequired qtyRecived status poStatus inventory po store user createdAt')
    .sort({ createdAt: -1 })
    .populate({
      path: 'inventory',
      select: 'masterItem',
      populate: {
        path: 'masterItem',
        select: 'partNo description unit',
        populate: {
          path: 'unit',
          select: 'name'
        }
      }
    })
    .populate({ path: 'po', select: 'poNumber' })
    .populate({ path: 'store', select: 'name storeCode location' })
    .populate({ path: 'user', select: 'name' })
    .lean();

  res.status(200).json({
    status: 'success',
    results: items.length,
    data: items,
  });
});


exports.downloadRequisitionReport = async (req, res) => {

  const { fromDate, toDate, status } = req.body;

  const fileName = "Requisition_Report.xlsx";

  const from = fromDate ? new Date(fromDate) : new Date(0);
  const to = toDate ? new Date(toDate) : new Date();

  // ✅ Date Validation
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return generateReport({
      model: Item,
      res,
      query: {},
      mapFunction: () => ({
        Message: "Invalid Date Range",
      }),
      fileName,
    });
  }

  from.setHours(0, 0, 0, 0);
  to.setHours(23, 59, 59, 999);

  // ✅ Query
  const query = {
    createdAt: {
      $gte: from,
      $lte: to,
    },
  };

  // ✅ Status Filter
  if (status && status !== "all") {
    query.status = status;
  }

  return generateReport({
    model: Item,

    query,

    // ✅ Faster query
    options: {
      lean: true,
      skipPopulate: true,
    },

    select:
      "inventory requisitionNo po mrv qtyRequired approveQty qtyRecived status adminRemark createdAt updatedAt",

    populate: [
      {
        path: "inventory",
        select: "qtyAuth currentStock store masterItem",
        options: { lean: true },

        populate: [
          {
            path: "store",
            select: "name",
            options: { lean: true },
          },
          {
            path: "masterItem",
            select: "partNo description unit",
            options: { lean: true },

            populate: {
              path: "unit",
              select: "name",
              options: { lean: true },
            },
          },
        ],
      },

      {
        path: "requisitionNo",
        select: "requisitionNo createdAt image status",
        options: { lean: true },
      },

      {
        path: "po",
        select: "poNumber createdAt",
        options: { lean: true },
      },

      {
        path: "mrv",
        select:
          "billingNo totalAmount otherCharges supplier mrvNo image",
        options: { lean: true },

        populate: {
          path: "supplier",
          select: "name",
          options: { lean: true },
        },
      },
    ],

    fileName,

    mapFunction: (item, index) => ({
      "S.No": index + 1,

      Store: item?.inventory?.store?.name || "",

      "Requisition No":
        item?.requisitionNo?.requisitionNo || "",

      "Requisition Status":
        item?.requisitionNo?.status === "submit"
          ? "Pending with Project Manager"
          : item?.requisitionNo?.status === "adminSubmit"
            ? "Pending with Central Team"
            : item?.requisitionNo?.status === "PO Pending"
              ? "Pending with PO Team"
              : item?.requisitionNo?.status === "pendingWithBoss"
                ? "Pending with HO"
                : item?.requisitionNo?.status === "close"
                  ? "Closed"
                  : item?.requisitionNo?.status === "cancelled"
                    ? "Cancelled"
                    : item?.requisitionNo?.status === "open"
                      ? "Open"
                      : "Unknown Status",

      "Requisition Created At":
        formatDate(item?.requisitionNo?.createdAt),

      // ✅ ITEM DETAILS
      "Part No":
        item?.inventory?.masterItem?.partNo || "",

      Description:
        item?.inventory?.masterItem?.description || "",

      Unit:
        item?.inventory?.masterItem?.unit?.name || "",

      Auth:
        item?.inventory?.qtyAuth || 0,

      "C-Stock":
        Number(item?.inventory?.currentStock || 0).toFixed(2),

      "Required Qty":
        item?.qtyRequired || 0,

      "Approved Qty":
        item?.approveQty || 0,

      "Received Qty":
        item?.qtyRecived || 0,

      ItemStatus:
        item?.status === "pending"
          ? "Pending with Project Manager"
          : item?.status === "approvedBySuperAdmin"
            ? "Pending with HO"
            : item?.status === "approved"
              ? "PO Receive Order Pending"
              : item?.status === "local"
                ? "Local Receive Order Pending"
                : item?.status === "recived"
                  ? "Order Received by Store"
                  : item?.status === "approvedByAdmin"
                    ? "Pending with Central Team"
                    : item?.status === "rejected"
                      ? "Rejected"
                      : item?.status === "autoclosed"
                        ? "Autoclosed"
                        : item?.status === "forceclosed"
                          ? "Forceclosed"
                          : item?.status === "tranfer request"
                            ? "Transfer Request"
                            : item?.status || "",

      // ✅ PO & BILL DETAILS
      "Po No.":
        item?.po?.poNumber || "Local",

      "Po Date":
        formatDate(item?.po?.createdAt),

      "Bill No":
        item?.mrv?.billingNo || "NA",

      "Total Amount":
        item?.mrv?.totalAmount || "NA",

      "Other Charges":
        item?.mrv?.otherCharges || "NA",

      "Bill Date":
        formatDate(item?.mrv?.createdAt),

      // ✅ SUPPLIER
      Supplier:
        item?.mrv?.supplier?.name || "",

      "MRV No":
        item?.mrv?.mrvNo || "",

      "Item Received Date":
        formatDate(item?.updatedAt),

      Reason:
        item?.adminRemark || "",


      "Requisition Img":
        item?.requisitionNo?.image
          ? `https://indigoinfra.in/img/requisitionform/${item?.requisitionNo?.image}`
          : "No Image",

      "Bill Image":
        item?.mrv?.image
          ? `https://indigoinfra.in/img/mrv/${item?.mrv?.image}`
          : "No Image",
    }),

    res,
  });
};



exports.updateQtyItem = factory.updateOne(Item);
exports.deleteInventroyItem = factory.deleteOne(Request);
