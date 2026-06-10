//const User = require('../models/use');
const { generateReport } = require("../utils/reportBuilder");
const suppliersModel = require('../models/suppliersListModel');
const catchAsync = require('../utils/catchAsync');
const factory = require('./handlerFactory');
const Item = require('../models/itemModel')
const Request = require('../models/requestedModel')
const AppError = require('../utils/appError');
const PurchaseOrder = require('../models/PurchaseOrder'); // your schema file
const BillingDepart = require('../models/billingDeptModel'); // your schema file

const User = require('../models/userModel');
const sendEmail = require('../utils/poEmail');
const { sendPOEmailsService } = require("../utils/poEmailService");
const XLSX = require("xlsx");
const formatDate = (date) => {
  if (!date) return "N/A";

  const d = new Date(date);

  return d.toLocaleDateString("en-GB");
  // Example: 06/05/2026
};




exports.createNewSupplier = factory.createOne(suppliersModel);

exports.activeSuppliers = catchAsync(async (req, res, next) => {
  const activeSuppliers = await suppliersModel
    .find({ status: 'active' })
    .sort({ name: 1 }); // ✅ ASC order (A → Z)

  res.status(200).json({
    status: 'success',
    results: activeSuppliers.length,
    data: activeSuppliers
  });
});

exports.inactiveSuppliers = catchAsync(async (req, res, next) => {
  const inactiveSuppliers = await suppliersModel.find({ status: 'inactive' });

  res.status(200).json({
    status: 'success',
    results: inactiveSuppliers.length,
    data: inactiveSuppliers
  });
});

exports.getPendingPOItemDetails = catchAsync(async (req, res, next) => {

  // ✅ STEP 1: Get all pending requests (lightweight)
  const pendingRequests = await Request.find({ status: 'PO Pending' })
    .select('_id requisitionNo createdAt updatedAt store')
    .populate('store', 'name address')
    .lean();

  if (!pendingRequests.length) {
    return res.status(200).json({
      status: 'success',
      message: 'No requisitions pending for Purchase Order.',
      data: []
    });
  }

  // ✅ STEP 2: Extract request IDs
  const requestIds = pendingRequests.map(r => r._id);

  // 🚀 STEP 3: SINGLE aggregation (replaces 100+ queries)
  const itemCounts = await Item.aggregate([
    {
      $match: {
        requisitionNo: { $in: requestIds },
        poStatus: 'pending',
        status: 'approved'
      }
    },
    {
      $group: {
        _id: "$requisitionNo",
        itemCount: { $sum: 1 }
      }
    }
  ]);

  // ✅ STEP 4: Convert aggregation to map
  const countMap = {};
  itemCounts.forEach(i => {
    countMap[i._id.toString()] = i.itemCount;
  });

  // ✅ STEP 5: Merge data (SAME OUTPUT FORMAT)
  const results = pendingRequests.map(reqItem => ({
    _id: reqItem._id,
    requisitionNo: reqItem.requisitionNo,
    createdAt: reqItem.createdAt,
    updatedAt: reqItem.updatedAt,
    store: reqItem.store?.name || 'Unknown',
    storeAddress: reqItem.store?.address || {},
    itemCount: countMap[reqItem._id.toString()] || 0
  }));

  // ✅ STEP 6: Filter (same as before)
  const filteredResult = results.filter(r => r.itemCount > 0);

  // ✅ FINAL RESPONSE (UNCHANGED)
  res.status(200).json({
    status: 'success',
    data: filteredResult
  });
});

exports.getPOItemsByRequestId = catchAsync(async (req, res, next) => {
  const { requestId } = req.params;

  const items = await Item.find({
    requisitionNo: requestId,
    poStatus: 'pending',
    status: 'approved'
  })
    .setOptions({ skipPopulate: true }) // ✅ skip middleware
    .select('inventory qtyRequired approveQty') // ✅ minimal fields
    .populate({
      path: 'inventory',
      select: 'masterItem currentStock',
      populate: {
        path: 'masterItem',
        select: 'partNo description unit',
        populate: {
          path: 'unit',
          select: 'name'
        }
      }
    })
    .lean()
    .maxTimeMS(5000); // ✅ prevent long DB wait

  res.status(200).json({
    status: 'success',
    data: items
  });
});

{/*
exports.getPendingPOItemDetailsold = catchAsync(async (req, res, next) => {
  // 1. Find all requests with status 'PO Pending' and populate store
  const pendingRequests = await Request.find({ status: 'PO Pending' }).populate('store');

  if (!pendingRequests.length) {
    return res.status(200).json({
      status: 'success',
      message: 'No requisitions pending for Purchase Order.',
      data: []
    });
  }

  // 2. For each request, get related items with poStatus: 'pending'
  const result = await Promise.all(
    pendingRequests.map(async (req) => {
      const items = await Item.find({ requisitionNo: req._id, poStatus: 'pending', status: 'approved' })
        .populate({
          path: 'inventory',
          populate: {
            path: 'masterItem',
            populate: { path: 'unit' }
          }
        });

      return {
        requisitionNo: req.requisitionNo,
        createdAt: req.createdAt,
        updatedAt: req.updatedAt,
        store: req.store?.name || 'Unknown',
        storeAddress: req.store?.address || {},
        itemCount: items.length,
        items,
      };
    })
  );

  // Optional: filter out any with zero items
  const filteredResult = result.filter(r => r.items.length > 0);

  if (!filteredResult.length) {
    return res.status(200).json({
      status: 'success',
      message: 'No requisitions pending for Purchase Order.',
      data: []
    });
  }


  // 3. Send response
  res.status(200).json({
    status: 'success',
    data: filteredResult
  });
});

*/}

exports.createPO = catchAsync(async (req, res, next) => {
  const {
    deliveryAddress,
    requisitionNo,
    items,
    subject,
    reference,
    termCondition,
    poType,
    advanceRentalAmount,
    advanceRentalPercent
  } = req.body;

  if (subject && typeof subject !== 'string') {
    return next(new AppError('Subject must be a string', 400));
  }

  if (reference && typeof reference !== 'string') {
    return next(new AppError('Reference must be a string', 400));
  }

  if (termCondition && !Array.isArray(termCondition)) {
    return next(new AppError('termCondition must be an array of strings', 400));
  }

  const createdBy = req.user._id;

  // 1. Validate payload
  if (
    !deliveryAddress ||
    !requisitionNo ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    return next(
      new AppError('Missing required fields or items list is empty', 400)
    );
  }

  // 2. Validate PO Type
  const allowedPoTypes = ['Normal', 'FOC PO', 'Advance Payment'];

  if (!poType || !allowedPoTypes.includes(poType)) {
    return next(new AppError('Invalid PO type', 400));
  }

  // 3. Validate Advance Payment
  if (poType === 'Advance Payment') {
    const amount = Number(advanceRentalAmount) || 0;
    const percent = Number(advanceRentalPercent) || 0;

    if (amount <= 0) {
      return next(new AppError('Advance Payment amount required', 400));
    }

    if (percent <= 0) {
      return next(new AppError('Advance Payment percentage required', 400));
    }
  }

  // 4. Validate & normalize items
  const cleanedItems = [];

  for (const item of items) {
    const {
      _id,
      partNo,
      description,
      unit,
      qtyRequired,
      approveQty,
      rate,
      supplier,
      cgst = 0,
      sgst = 0,
      igst = 0
    } = item;

    if (
      !partNo ||
      !description ||
      !unit ||
      qtyRequired == null ||
      approveQty == null ||
      rate == null ||
      !supplier
    ) {
      return next(
        new AppError('Each item must contain all required fields', 400)
      );
    }

    cleanedItems.push({
      _id,
      partNo,
      description,
      unit,
      qtyRequired,
      approveQty,
      rate,
      supplier: supplier._id || supplier,
      cgst,
      sgst,
      igst
    });
  }

  // 5. Calculate totals
  let totalBaseAmount = 0;
  let totalCGSTAmount = 0;
  let totalSGSTAmount = 0;
  let totalIGSTAmount = 0;

  for (const item of cleanedItems) {
    const qty = Number(item.approveQty) || 0;
    const rate = Number(item.rate) || 0;
    const cgstPercent = Number(item.cgst) || 0;
    const sgstPercent = Number(item.sgst) || 0;
    const igstPercent = Number(item.igst) || 0;

    const base = qty * rate;
    const cgst = base * (cgstPercent / 100);
    const sgst = base * (sgstPercent / 100);
    const igst = base * (igstPercent / 100);

    totalBaseAmount += base;
    totalCGSTAmount += cgst;
    totalSGSTAmount += sgst;
    totalIGSTAmount += igst;
  }

  // Final Amount
  const totalAmount = Math.round(
    totalBaseAmount +
    totalCGSTAmount +
    totalSGSTAmount +
    totalIGSTAmount
  );

  // 6. Create Purchase Order
  const po = await PurchaseOrder.create({
    deliveryAddress,
    requisitionNo,
    subject,
    reference,
    termCondition,
    poType,

    advanceRentalAmount:
      poType === 'Advance Payment'
        ? Number(advanceRentalAmount || 0)
        : 0,

    advanceRentalPercent:
      poType === 'Advance Payment'
        ? Number(advanceRentalPercent || 0)
        : 0,

    items: cleanedItems.map(({ _id, ...rest }) => ({
      ...rest,
      itemId: _id
    })),

    totalAmount,
    totalCGSTAmount,
    totalSGSTAmount,
    totalIGSTAmount,
    totalItems: cleanedItems.length,
    createdBy
  });

  // 7. Update selected item status
  for (const item of cleanedItems) {
    if (item._id) {
      await Item.findByIdAndUpdate(item._id, {
        status: 'approved',
        poStatus: 'pendingForApproval',
        po: po._id
      });
    }
  }

  // 8. Check remaining items
  const remainingItems = await Item.find({
    requisitionNo,
    poStatus: { $ne: 'pendingForApproval' },
    status: { $in: ['approved'] }
  });

  // 9. Close requisition
  if (remainingItems.length === 0) {
    await Request.findByIdAndUpdate(requisitionNo, {
      status: 'close'
    });
  }

  // 10. Response
  res.status(201).json({
    status: 'success',
    message: 'Purchase Order created successfully',
    data: po
  });
});


exports.purchaseOrderByStatus = async (req, res) => {
  try {
    const { query } = req.query; // e.g., ?query=Approved OR ?query=All

    const filter = {}; // ✅ base filter

    const allowedStatuses = [
      'Generated',          // Maker created or re-submitted
      'Assigned-To-Maker',  // Sent back by Checker/Admin
      'Assigned-To-Checker',
      'Assigned-To-SuperAdmin',
      'Confirmed-Generated', // Final approval from Admin
      'Rejected',
      'Cancelled',
      'Order-Received',
      'Partially-Received',
      'Completed',
      'All',
      'Bill-Generated',
      'start',              // 👈 special case
      'submittedToAdmin'    // 👈 NEW case
    ];

    if (query) {
      if (!allowedStatuses.includes(query)) {
        return res.status(400).json({
          success: false,
          message: `Invalid status`
        });
      }

      if (query === "All") {
        filter.status = {
          $in: [
            'Generated',
            'Assigned-To-Maker',
            'Assigned-To-Checker',
            'Assigned-To-SuperAdmin',
            'Bill-Generated',
            'PaymentPending'
          ]
        };
      } else if (query === "start") {
        // 👇 Special case: billingStatus + status
        filter.billingStatus = "start";
        filter.status = "Order-Received";
      } else if (query === "submittedToAdmin") {
        // 👇 NEW special case
        filter.billingStatus = "submittedToAdmin";
        filter.status = "Bill-Generated";
      } else {
        // 👇 Normal case
        filter.status = query;
      }
    }

    const purchaseOrders = await PurchaseOrder.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: purchaseOrders.length,
      data: purchaseOrders,
    });

  } catch (error) {
    console.error('Error fetching POs by status:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching purchase orders'
    });
  }
};



// ================================
//   GET PO + ITEMS BY STATUS
// ================================
exports.getPoWithItemsByStatus = async (req, res) => {
  try {
    const { status } = req.query;

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required"
      });
    }

    // 1️⃣ Get PO _id & poNumber only
    const purchaseOrders = await PurchaseOrder.find({ status })
      .select("_id poNumber status")
      .lean();

    if (purchaseOrders.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: []
      });
    }

    // 2️⃣ Extract PO IDs
    const poIdsObject = purchaseOrders.map(po => po._id);
    const poIdsString = poIdsObject.map(id => String(id));

    // 3️⃣ Fetch items (both ObjectId OR String cases)
    const items = await Item.find({
      $or: [
        { po: { $in: poIdsObject } },  // When po is ObjectId
        {
          $expr: {
            $in: [{ $toString: "$po" }, poIdsString]  // When po stored as string
          }
        }
      ]
    }).lean();

    // 4️⃣ Group items under each PO
    const result = purchaseOrders.map(po => ({
      poId: po._id,
      poNumber: po.poNumber,
      status: po.status,
      items: items.filter(item =>
        String(item.po?._id || item.po) === String(po._id)   // ⭐ REAL MATCH
      )
    }));

    return res.status(200).json({
      success: true,
      count: result.length,
      data: result
    });

  } catch (error) {
    console.error("Error fetching PO report by status:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching Purchase Orders with items"
    });
  }
};



exports.AllItemsByPoId = catchAsync(async (req, res, next) => {
  const { poId } = req.query;

  if (!poId) {
    return next(new AppError('PO ID is required in query', 400));
  }

  const items = await Item.find({ po: poId })
    .populate({
      path: 'inventory',
      populate: {
        path: 'masterItem',
        select: 'partNo description',
      },
    })

  res.status(200).json({
    success: true,
    count: items.length,
    data: items,
  });
});




// Controller to handle checker/superAdmin approval flow
exports.approvePO = async (req, res) => {
  console.log("approval body", req.body)
  try {
    const { poId, action, remark } = req.body;
    const user = req.user; // authenticated user
    const userRole = user.role; // ✅ always trust backend, not frontend
    const po = await PurchaseOrder.findById(poId);
    if (!po) {
      return res.status(404).json({ message: "PO not found" });
    }

    const fromStatus = po.status;
    let toStatus = fromStatus;

    // Maker actions
    if (userRole === "pomaker") {
      if (action === "Assigned-To-Checker") {
        toStatus = "Generated";
      }
    }

    // Checker actions
    if (userRole === "pochecker") {
      if (action === "Approved") {
        toStatus = "Assigned-To-SuperAdmin"; // ⚠️ match schema enum (case-sensitive!)
      } else if (action === "Reject") {
        toStatus = "Rejected";
      } else if (action === "Send-Back") {
        toStatus = "Assigned-To-Maker";
      }
    }

    // SuperAdmin actions
    if (userRole === "director") {
      if (action === "Approved") {
        toStatus = "Confirmed-Generated";

        // ✅ Update all linked items' poStatus → "generated"
        const itemIds = po.items.map(it => it.itemId).filter(Boolean);
        if (itemIds.length > 0) {
          await Item.updateMany(
            { _id: { $in: itemIds } },
            { $set: { poStatus: "generated" } }
          );
        }
      } else if (action === "Reject") {
        toStatus = "Rejected";
      } else if (action === "Send-Back") {
        toStatus = "Assigned-To-Maker";
      }
    }

    // Update status
    po.status = toStatus;

    // ✅ Push history log (use authenticated role!)
    po.history.push({
      action: action === "Send-Back" ? "Sent-Back" : action,
      fromStatus,
      toStatus,
      remark: remark || "",
      user: user._id,
      role: userRole, // snapshot from backend
      date: new Date(),
    });

    await po.save();

    res.json({
      status: 201,
      message: `PO ${action} captured successfully`,
      po,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error",
      error: err.message,
    });
  }
};

exports.superAdminBillingAction = catchAsync(async (req, res, next) => {
  const { poId, action, amount, remark } = req.body;
  const userId = req.user._id;
  const userRole = req.user.role;

  if (!poId || !action) {
    return next(new AppError("PO ID and action are required", 400));
  }

  // 1️⃣ Fetch Purchase Order (needed to get billingId)
  const po = await PurchaseOrder.findById(poId);
  if (!po) return next(new AppError("PO not found", 404));

  const billingId = po.billing; // 🔥 this replaces old { po: poId }

  const previousStatus = po.status;

  // ----------------------------------------------------
  // 1️⃣ RETURN TO BILLING TEAM
  // ----------------------------------------------------
  if (action === "return") {
    po.billingStatus = "start";
    po.status = "Order-Received";

    po.history.push({
      action: "Sent-Back",
      fromStatus: previousStatus,
      toStatus: "Order-Received",
      remark: remark || "",
      user: userId,
      role: userRole,
      date: new Date()
    });

    await po.save();

    // Billing record exists?
    if (billingId) {
      await BillingDepart.findByIdAndUpdate(billingId, {
        status: "submitted"     // back to billing team
      });
    }

    return res.status(200).json({
      status: "success",
      message: "PO returned back to Billing Team",
      data: po,
    });
  }

  // ----------------------------------------------------
  // 2️⃣ APPROVE BILLING
  // ----------------------------------------------------
  if (action === "approve") {
    if (!amount) {
      return next(new AppError("Approved amount is required", 400));
    }

    po.billingStatus = "paymentPending";
    po.status = "PaymentPending";

    po.history.push({
      action: "Approved",
      fromStatus: previousStatus,
      toStatus: "PaymentPending",
      remark: remark || "",
      user: userId,
      role: userRole,
      date: new Date()
    });

    await po.save();

    // 🔥 Correct way to update billing record
    let billingRecord = null;

    if (billingId) {
      billingRecord = await BillingDepart.findByIdAndUpdate(
        billingId,
        {
          approvedAmount: amount,
          status: "submittedToAccount",
        },
        { new: true }
      );
    }

    return res.status(200).json({
      status: "success",
      message: "Billing approved successfully",
      po,
      billingRecord,
    });
  }

  return next(new AppError("Invalid action type", 400));
});

//bulk apporval

exports.superAdminBillingBulkAction = catchAsync(async (req, res, next) => {
  const { poIds, remark } = req.body;
  const userId = req.user._id;
  const userRole = req.user.role;

  if (!poIds || !Array.isArray(poIds) || poIds.length === 0) {
    return next(new AppError("PO IDs array is required", 400));
  }

  let successCount = 0;
  let failed = [];

  for (const poId of poIds) {
    try {
      // 1️⃣ Fetch the PO so we get its billing id
      const po = await PurchaseOrder.findById(poId);

      if (!po) {
        failed.push({ poId, error: "PO not found" });
        continue;
      }

      // 2️⃣ Update Purchase Order
      await PurchaseOrder.findByIdAndUpdate(
        poId,
        {
          billingStatus: "paymentPending",
          status: "PaymentPending",
          $push: {
            history: {
              action: "Approved",
              fromStatus: "Bill-Generated",
              toStatus: "PaymentPending",
              remark: remark || "",
              user: userId,
              role: userRole,
              date: new Date()
            }
          }
        },
        { new: true }
      );

      // 3️⃣ Update BillingDepart using billing ID stored inside PO
      if (po.billing) {
        await BillingDepart.findByIdAndUpdate(
          po.billing,
          {
            status: "submittedToAccount"
          }
        );
      } else {
        failed.push({ poId, error: "No billing record linked with PO" });
        continue;
      }

      successCount++;

    } catch (err) {
      failed.push({ poId, error: err.message });
    }
  }

  return res.status(200).json({
    status: "success",
    message: `Bulk approval completed`,
    approved: successCount,
    failed
  });
});




// ✅ Update PO controller (GST-safe, no side effects)
exports.updatePO = catchAsync(async (req, res, next) => {
  const { id } = req.params;

  const {
    items,
    termCondition,
    subject,
    poType,
    advanceRentalAmount,
    advanceRentalPercent
  } = req.body;

  const user = req.user;

  const po = await PurchaseOrder.findById(id).populate(
    "items.supplier",
    "name"
  );

  if (!po) {
    return next(new AppError("Purchase Order not found", 404));
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError("At least one item is required.", 400));
  }

  let totalAmount = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;
  let changes = [];

  po.items.forEach((existing) => {
    // ✅ safer id match
    const updated = items.find(
      (it) =>
        String(it.id || it._id || "") ===
        String(existing._id)
    );

    if (!updated) {
      // keep old values if no match
      const baseAmount =
        Number(existing.approveQty) *
        Number(existing.rate);

      const lineCGST =
        (baseAmount * Number(existing.cgst || 0)) / 100;

      const lineSGST =
        (baseAmount * Number(existing.sgst || 0)) / 100;

      const lineIGST =
        (baseAmount * Number(existing.igst || 0)) / 100;

      totalCGST += lineCGST;
      totalSGST += lineSGST;
      totalIGST += lineIGST;

      totalAmount +=
        baseAmount +
        lineCGST +
        lineSGST +
        lineIGST;

      return;
    }

    const oldData = existing.toObject();

    const qty =
      updated.approveQty !== undefined
        ? Number(updated.approveQty)
        : Number(existing.approveQty);

    const rate =
      updated.rate !== undefined
        ? Number(updated.rate)
        : Number(existing.rate);

    const cgst =
      updated.cgst !== undefined
        ? Number(updated.cgst)
        : Number(existing.cgst);

    const sgst =
      updated.sgst !== undefined
        ? Number(updated.sgst)
        : Number(existing.sgst);

    const igst =
      updated.igst !== undefined
        ? Number(updated.igst)
        : Number(existing.igst);

    const description =
      updated.description !== undefined
        ? updated.description
        : existing.description;

    const itemLabel = `PartNo: ${oldData.partNo}, Description: ${oldData.description}`;

    // ✅ change tracking
    if (oldData.approveQty !== qty) {
      changes.push(
        `${itemLabel} | approveQty: ${oldData.approveQty} → ${qty}`
      );
    }

    if (oldData.rate !== rate) {
      changes.push(
        `${itemLabel} | rate: ${oldData.rate} → ${rate}`
      );
    }

    if (oldData.cgst !== cgst) {
      changes.push(
        `${itemLabel} | cgst: ${oldData.cgst} → ${cgst}`
      );
    }

    if (oldData.sgst !== sgst) {
      changes.push(
        `${itemLabel} | sgst: ${oldData.sgst} → ${sgst}`
      );
    }

    if (oldData.igst !== igst) {
      changes.push(
        `${itemLabel} | igst: ${oldData.igst} → ${igst}`
      );
    }

    if (oldData.description !== description) {
      changes.push(
        `${itemLabel} | description: "${oldData.description}" → "${description}"`
      );
    }

    // ✅ direct assign (important fix)
    existing.approveQty = qty;
    existing.rate = rate;
    existing.cgst = cgst;
    existing.sgst = sgst;
    existing.igst = igst;
    existing.description = description;
    existing.supplier =
      updated.supplier || existing.supplier;

    // ✅ totals
    const baseAmount = qty * rate;

    const lineCGST = (baseAmount * cgst) / 100;
    const lineSGST = (baseAmount * sgst) / 100;
    const lineIGST = (baseAmount * igst) / 100;

    totalCGST += lineCGST;
    totalSGST += lineSGST;
    totalIGST += lineIGST;

    totalAmount +=
      baseAmount +
      lineCGST +
      lineSGST +
      lineIGST;
  });

  po.markModified("items");

  // ===================================
  // Terms & Conditions
  // ===================================
  if (Array.isArray(termCondition)) {
    po.termCondition = termCondition;
  }

  // ===================================
  // Subject
  // ===================================
  if (subject !== undefined) {
    po.subject = subject;
  }

  // ===================================
  // PO Type
  // ===================================
  if (poType !== undefined) {
    po.poType = poType;
  }

  // ===================================
  // Advance Payment
  // ===================================
  const newAdvanceAmount = Number(
    advanceRentalAmount || 0
  );

  const newAdvancePercent = Number(
    advanceRentalPercent || 0
  );

  if (poType === "Advance Payment") {
    if (
      newAdvanceAmount <= 0 ||
      newAdvancePercent <= 0
    ) {
      return next(
        new AppError(
          "Valid Advance Payment amount and percentage required",
          400
        )
      );
    }

    if (newAdvanceAmount > totalAmount) {
      return next(
        new AppError(
          "Advance Payment amount cannot exceed total amount",
          400
        )
      );
    }

    if (newAdvancePercent > 100) {
      return next(
        new AppError(
          "Advance Payment percentage cannot exceed 100%",
          400
        )
      );
    }

    po.advanceRentalAmount = newAdvanceAmount;
    po.advanceRentalPercent = newAdvancePercent;
  } else {
    po.advanceRentalAmount = 0;
    po.advanceRentalPercent = 0;
  }

  // ===================================
  // Totals
  // ===================================
  po.totalAmount = totalAmount;
  po.totalCGSTAmount = totalCGST;
  po.totalSGSTAmount = totalSGST;
  po.totalIGSTAmount = totalIGST;
  po.totalItems = po.items.length;

  // ===================================
  // History
  // ===================================
  po.history.push({
    action: "Updated",
    fromStatus: po.status,
    toStatus: po.status,
    remark:
      changes.length > 0
        ? changes.join(", ")
        : "No field changes",
    user: user._id,
    role: user.role
  });

  await po.save();

  res.status(200).json({
    status: "success",
    message: "Purchase Order updated successfully",
    data: po
  });
});

exports.getAllPODashboardData = async (req, res, next) => {
  try {

    const user = req.user;

    // ===================================
    // ✅ PENDING STATUS FILTER
    // ===================================
    const PENDING_STATUS = [
      'Assigned-To-Maker',
      'Assigned-To-Checker',
      'Assigned-To-SuperAdmin',
      'Generated'
    ];

    let filter = {
      status: { $in: PENDING_STATUS }
    };

    // ===================================
    // ✅ ROLE BASE CONTROL
    // ===================================
    const restrictedRoles = ['storeKeeper', 'admin'];

    let populateMatch = {};

    if (restrictedRoles.includes(user.role)) {
      const storeIds = user.store?.map(s => s._id);

      populateMatch = {
        store: { $in: storeIds }
      };
    }

    // ===================================
    // 🚀 FAST QUERY
    // ===================================
    const data = await PurchaseOrder.find(filter)
      .setOptions({ skipPopulate: true })
      .select({
        poNumber: 1,
        status: 1,
        totalAmount: 1,
        createdAt: 1,
        createdBy: 1,
        requisitionNo: 1,
        totalItems: 1,
        items: 1,
        history: 1,
        // ✅ NEW FIELDS
        poType: 1,
        advanceRentalAmount: 1,
        advanceRentalPercent: 1
      })
      .populate({
        path: 'requisitionNo',
        select: 'requisitionNo store',
        match: Object.keys(populateMatch).length ? populateMatch : undefined,
        populate: {
          path: 'store',
          select: 'name'
        }
      })

      // ✅ CREATED BY NAME FOR LOG MODAL
      .populate({
        path: 'createdBy',
        select: 'name'
      })

      // ✅ HISTORY USER NAME FOR LOGS
      .populate({
        path: 'history.user',
        select: 'name'
      })

      // ✅ SUPPLIER
      .populate({
        path: 'items.supplier',
        select: 'name address'
      })

      .sort({ createdAt: -1 })
      .lean();

    // ===================================
    // ✅ FILTER STORE DATA
    // ===================================
    const finalData = restrictedRoles.includes(user.role)
      ? data.filter(item => item.requisitionNo !== null)
      : data;

    // ===================================
    // ✅ ADD SUPPLIER NAME & STATE
    // ===================================
    const enhancedData = finalData.map(po => ({
      ...po,
      items: po.items.map(itm => {
        const supplierName = itm.supplier?.name || "";
        const supplierState = itm.supplier?.address?.state || "";

        // remove supplier object only
        const { supplier, ...rest } = itm;

        return {
          ...rest,
          supplierName,
          supplierState
        };
      })
    }));

    return res.status(200).json({
      status: "success",
      count: enhancedData.length,
      data: enhancedData
    });

  } catch (error) {
    console.error("Error fetching PO:", error);

    return res.status(500).json({
      status: "fail",
      message: "Failed to fetch purchase orders"
    });
  }
};


exports.getPoByCreatedDateRange = catchAsync(async (req, res, next) => {

  const { from, to, page = 1, limit = 20 } = req.body;

  if (!from || !to) {
    return next(
      new AppError('Both from and to dates are required', 400)
    );
  }

  // ✅ Normalize dates (full day coverage)
  const fromDate = new Date(from);
  fromDate.setHours(0, 0, 0, 0);

  const toDate = new Date(to);
  toDate.setHours(23, 59, 59, 999);

  const skip = (page - 1) * limit;

  // ✅ Query condition
  const filter = {
    createdAt: {
      $gte: fromDate,
      $lte: toDate
    }
  };

  // ✅ Fetch data
  const [totalRecords, purchaseOrders] = await Promise.all([
    PurchaseOrder.countDocuments(filter),
    PurchaseOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
  ]);

  res.status(200).json({
    status: 'success',
    results: purchaseOrders.length,
    totalRecords,
    totalPages: Math.ceil(totalRecords / limit),
    currentPage: Number(page),
    data: purchaseOrders
  });
});



exports.downloadPendingPOReport = async (req, res) => {
  try {
    const data = await Item.aggregate([
      {
        $match: {
          poStatus: "pending",
          status: "approved"
        }
      },

      // 🔹 REQUEST
      {
        $lookup: {
          from: "requests",
          localField: "requisitionNo",
          foreignField: "_id",
          as: "request"
        }
      },
      { $unwind: "$request" },

      {
        $match: {
          "request.status": "PO Pending"
        }
      },

      // 🔹 STORE
      {
        $lookup: {
          from: "stores",
          localField: "request.store",
          foreignField: "_id",
          as: "store"
        }
      },
      { $unwind: { path: "$store", preserveNullAndEmptyArrays: true } },

      // 🔹 INVENTORY
      {
        $lookup: {
          from: "inventories",
          localField: "inventory",
          foreignField: "_id",
          as: "inventory"
        }
      },
      { $unwind: { path: "$inventory", preserveNullAndEmptyArrays: true } },

      // 🔹 MASTER ITEM
      {
        $lookup: {
          from: "masterlists",
          localField: "inventory.masterItem",
          foreignField: "_id",
          as: "masterItem"
        }
      },
      { $unwind: { path: "$masterItem", preserveNullAndEmptyArrays: true } },

      // 🔥 🔥 ADD THIS (UNIT LOOKUP)
      {
        $lookup: {
          from: "units",
          localField: "masterItem.unit",
          foreignField: "_id",
          as: "unit"
        }
      },
      { $unwind: { path: "$unit", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          requisitionNo: "$request.requisitionNo",
          createdAt: "$request.createdAt",
          updatedAt: "$request.updatedAt",
          store: "$store.name",
          partNo: "$masterItem.partNo",
          description: "$masterItem.description",
          unit: "$unit.name", // ✅ FIXED
          qtyRequired: "$qtyRequired",
          approveQty: "$approveQty"
        }
      },

      {
        $sort: {
          requisitionNo: 1,
          createdAt: 1
        }
      }
    ]);

    // ✅ GROUP
    const grouped = {};
    data.forEach(item => {
      const key = item.requisitionNo || "UNKNOWN";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });

    const combinedData = [];

    Object.keys(grouped).forEach((reqKey, reqIndex) => {
      const items = grouped[reqKey];

      items.forEach((item, itemIndex) => {
        combinedData.push({
          "Req. S.No": reqIndex + 1,
          "Store": item.store || "N/A",
          "Requisition No.": item.requisitionNo || "N/A",
          "Created Date": formatDate(item.createdAt),
          "Approved Date": formatDate(item.updatedAt),
          "Item S.No": itemIndex + 1,
          "Part No": item.partNo || "-",
          "Description": item.description || "-",

          // ✅ NEW COLUMN
          "Unit": item.unit || "-",

          "Qty Required": item.qtyRequired || 0,
          "Approved Qty": item.approveQty || 0,
        });
      });
    });

    // ✅ EXCEL
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(combinedData);

    XLSX.utils.book_append_sheet(workbook, worksheet, "PendingPOs");

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    res.setHeader(
      "Content-Disposition",
      "attachment; filename=PendingPOs.xlsx"
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );

    res.send(buffer);

  } catch (error) {
    console.error("PO Excel Error:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to generate PO report",
    });
  }
};

exports.getPOById = catchAsync(async (req, res, next) => {
  const { poId } = req.params;

  if (!poId) {
    return next(new AppError("PO ID is required", 400));
  }

  const po = await PurchaseOrder.findById(poId)

    .populate({
      path: "requisitionNo",
      select: "requisitionNo createdAt store user",
      populate: [
        { path: "store", select: "name address" },
        { path: "user", select: "name mobileNo" },
      ],
    })

    .populate({
      path: "items.supplier",
      select: "name address GSTNo contactPerson mobileNo",
    })

    .populate({
      path: "createdBy",
      select: "name",
    })

    .populate({
      path: "history.user",
      select: "name role",
    })

    .populate({
      path: "billing",
      strictPopulate: false,
    });

  if (!po) {
    return next(new AppError("Purchase Order not found", 404));
  }

  // ✅ EXTRACT DIRECTOR APPROVAL
  const directorApproval = po.history
    ?.filter(h => h.action === "Approved" && h.role === "director")
    ?.sort((a, b) => new Date(b.date) - new Date(a.date))[0];

  const approvedByDirector = directorApproval
    ? {
        name: directorApproval?.user?.name || "",
        role: directorApproval?.role || "",
        date: directorApproval?.date || "",
      }
    : null;

  // ✅ SEND RESPONSE
  res.status(200).json({
    status: "success",
    data: {
      ...po.toObject(),
      approvedByDirector, // 🔥 ADD THIS
    },
  });
});

exports.sendPOEmails = async (req, res) => {
  try {
    const result = await sendPOEmailsService();
    res.status(200).json({
      status: "success",
      message: "Emails sent successfully",
      details: result,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "error",
      message: "Failed to send PO emails",
      error: err.message,
    });
  }
};







exports.allPurchaseOrder = factory.getAll(PurchaseOrder)

exports.updateSupplierById = factory.updateOne(suppliersModel);
exports.deleteSupplierById = factory.deleteOne(suppliersModel);
