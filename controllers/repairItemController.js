const RepairRequest = require('../models/repairRequestModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const Inventory = require('../models/inventoryModel');
const RepairItem = require('../models/repairItemModel');


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
    filter.repairOrder = reqNo;
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

  const doc = await RepairItem.find(filter)

  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
});

// UPDATE REPAIR ITEM
// ==========================================
// UPDATE REPAIR ITEM
// ==========================================
exports.updateRequestItem = catchAsync(async (req, res, next) => {
  const user = req.user;
  const itemId = req.params.id;

  // ITEM EXISTS?
  const existingItem = await RepairItem.findById(itemId);
  if (!existingItem) return next(new AppError('Repair item not found', 404));

  const repairOrderId = existingItem.repairOrder;

  // STOREKEEPER RESTRICTIONS
  let body = {};
  if (user.role === 'storeKeeper') {
    body.approveQty = req.body.approveQty;
    body.status = req.body.status;
    body.qtyReceived = req.body.qtyReceived;
    body.receivedDate = req.body.receivedDate;
    body.receivedBy = user._id;
  } else {
    body = req.body;
  }

  // ===================================
  // 🔒 ROLE BASED STATUS PROTECTION
  // ===================================
  // 👤 CAPTURE DECISION MAKER & TIME
  // ===================================

  // ADMIN (approve OR reject)
  if (
    (body.status === 'approvedByAdmin' || body.status === 'rejected') &&
    user.role === 'admin'
  ) {
    body.approvedByAdmin = user._id;
    body.adminApprovedAt = new Date();
  }

  // SUPER ADMIN (approve / local / reject)
  if (
    (body.status === 'approved' ||
      body.status === 'local' ||
      body.status === 'rejected') &&
    user.role === 'superAdmin'
  ) {
    body.approvedBySuperAdmin = user._id;
    body.superAdminApprovedAt = new Date();
  }


  // ===================================
  // 👤 CAPTURE APPROVER ID & TIME
  // ✅ (ONLY MOVED HERE — LOGIC UNCHANGED)
  // ===================================

  // ADMIN APPROVAL
  if (body.status === 'approvedByAdmin' && user.role === 'admin') {
    body.approvedByAdmin = user._id;
    body.adminApprovedAt = new Date();
  }

  // SUPER ADMIN FINAL APPROVAL
  if (body.status === 'approved' && user.role === 'superAdmin') {
    body.approvedBySuperAdmin = user._id;
    body.superAdminApprovedAt = new Date();
  }

  // EXTRA: LOCAL ITEM → PO CREATED
  // ================================
  if (body.status === 'local') {
    body.poStatus = 'generated';
  }

  // ================================
  // UPDATE REPAIR ITEM
  // ================================
  const updatedItem = await RepairItem.findByIdAndUpdate(itemId, body, {
    new: true,
    runValidators: true,
  });

  if (!updatedItem) {
    return next(new AppError('Update failed', 400));
  }

  // ===================================================
  // UPDATE INVENTORY (ONLY WHEN STATUS = LOCAL)
  // ===================================================
  if (body.status === 'local') {
    const approvedQty = updatedItem.approveQty;

    if (updatedItem.inventory && approvedQty) {
      const inventory = await Inventory.findById(updatedItem.inventory);

      if (inventory) {
        inventory.repairQty =
          (inventory.repairQty || 0) + Number(approvedQty);

        await inventory.save();
      }
    }
  }

  // =========================================================
  // 🔥 STATUS CASCADE LOGIC
  // =========================================================

  /** CASE 1 — APPROVED BY ADMIN */
  if (body.status === 'approvedByAdmin') {
    const pendingItems = await RepairItem.find({
      repairOrder: repairOrderId,
      status: 'pending',
    });

    if (pendingItems.length === 0) {
      await RepairRequest.findByIdAndUpdate(repairOrderId, {
        status: 'adminSubmit',
      });
    }
  }

  /** CASE 2 — REJECTED */
  if (body.status === 'rejected') {
    const checkStatus = user.role === 'admin' ? 'pending' : 'approvedByAdmin';

    const remainingItems = await RepairItem.find({
      repairOrder: repairOrderId,
      status: checkStatus,
    });

    if (remainingItems.length === 0) {
      await RepairRequest.findByIdAndUpdate(repairOrderId, {
        status: user.role === 'admin' ? 'adminSubmit' : 'PO Pending',
      });
    }
  }

  /** CASE 3 — STATUS: LOCAL */
  if (body.status === 'local') {
    const totalItems = await RepairItem.countDocuments({ repairOrder: repairOrderId });
    const localCount = await RepairItem.countDocuments({
      repairOrder: repairOrderId,
      status: 'local',
    });

    if (totalItems === 1 && localCount === 1) {
      await RepairRequest.findByIdAndUpdate(repairOrderId, { status: 'close' });
    } else {
      const closedStatuses = [
        'autoclosed',
        'forceclosed',
        'transferRequest',
        'local',
        'rejected',
      ];

      const closedCount = await RepairItem.countDocuments({
        repairOrder: repairOrderId,
        status: { $in: closedStatuses },
      });

      if (closedCount === totalItems) {
        await RepairRequest.findByIdAndUpdate(repairOrderId, { status: 'close' });
      }
    }
  }

  /** CASE 4 — PO Pending Logic */
  const countAdminApproved = await RepairItem.countDocuments({
    repairOrder: repairOrderId,
    status: 'approvedByAdmin',
  });

  if (countAdminApproved === 0) {
    const hasApprovedPO = await RepairItem.exists({
      repairOrder: repairOrderId,
      status: 'approved',
    });

    if (hasApprovedPO) {
      await RepairRequest.findByIdAndUpdate(repairOrderId, {
        status: 'PO Pending',
      });
    }
  }

  /** FINAL CLOSE CHECK */
  const total = await RepairItem.countDocuments({ repairOrder: repairOrderId });
  const finalClose = await RepairItem.countDocuments({
    repairOrder: repairOrderId,
    status: {
      $in: [
        'autoclosed',
        'forceclosed',
        'transferRequest',
        'local',
        'rejected',
      ],
    },
  });

  if (total > 0 && total === finalClose) {
    await RepairRequest.findByIdAndUpdate(repairOrderId, {
      status: 'close',
    });
  }

  // ----------------------------------------
  // RESPONSE
  // ----------------------------------------
  res.status(200).json({
    status: 'success',
    data: updatedItem,
  });
});



