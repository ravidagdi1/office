const RepairRequest = require("../models/repairRequestModel");
const RepairItem = require("../models/repairItemModel");
const RepairPurchaseOrder =require('../models/repairPurchaseOrder')
const Inventory =require('../models/inventoryModel')
const AppError = require("../utils/appError");
const catchAsync = require("../utils/catchAsync");

exports.getPendingPOItemDetails = catchAsync(async (req, res, next) => {

  // 1️⃣ Get all pending repair requests (lightweight)
  const pendingRequests = await RepairRequest.find({ status: "PO Pending" })
    .select("repairOrderNo createdAt updatedAt store inventory")
    .populate("store", "name address storeCode")
    .populate("inventory", "masterItem");

  if (!pendingRequests.length) {
    return res.status(200).json({
      status: "success",
      message: "No repair requests pending for Purchase Order.",
      data: [],
    });
  }

  const requestIds = pendingRequests.map(r => r._id);

  // 2️⃣ Fetch ALL items in ONE query (🔥 SKIP AUTO POPULATE)
  const allItems = await RepairItem.find({
    repairOrder: { $in: requestIds },
    poStatus: "pending",
    status: "approved",
  })
    .setOptions({ skipPopulate: true })   // ✅ IMPORTANT LINE
    .select("repairOrder masterlist approveQty qtyRequired createdAt updatedAt")
    .populate({
      path: "masterlist",
      select: "partNo description unit",
      populate: { path: "unit", select: "name" },
    });

  // 3️⃣ Group items by repairOrder
  const groupedItems = {};

  allItems.forEach(item => {
    const key = item.repairOrder.toString();
    if (!groupedItems[key]) groupedItems[key] = [];
    groupedItems[key].push(item);
  });

  // 4️⃣ Build final response
  const result = pendingRequests.map(reqObj => {
    const items = groupedItems[reqObj._id.toString()] || [];

    return {
      repairOrderNo: reqObj.repairOrderNo,
      createdAt: reqObj.createdAt,
      updatedAt: reqObj.updatedAt,

      store: reqObj.store?.name || "Unknown",
      storeAddress: reqObj.store?.address || {},
      storeCode: reqObj.store?.storeCode || "",

      inventoryPartNo: reqObj.inventory?.masterItem?.partNo || "",
      inventoryDescription: reqObj.inventory?.masterItem?.description || "",

      itemCount: items.length,
      items,
    };
  }).filter(entry => entry.items.length > 0);

  // 5️⃣ Response
  res.status(200).json({
    status: "success",
    data: result,
  });
});

exports.createRepairPO = catchAsync(async (req, res, next) => {
  const {
    repairOrder,
    items,
    supplier,
    subject,
    reference,
    termCondition,
    poType
  } = req.body;

  const createdBy = req.user._id;

  /* -----------------------------------------------------------
      1. Validate required fields
  ----------------------------------------------------------- */
  if (!repairOrder || !Array.isArray(items) || items.length === 0) {
    return next(new AppError("Missing required fields: repairOrder or items", 400));
  }

  if (!supplier) {
    return next(new AppError("Supplier is required for repair PO", 400));
  }

  if (subject && typeof subject !== "string") {
    return next(new AppError("Subject must be a string", 400));
  }

  if (reference && typeof reference !== "string") {
    return next(new AppError("Reference must be a string", 400));
  }

  if (termCondition && !Array.isArray(termCondition)) {
    return next(new AppError("Term conditions must be an array", 400));
  }

  const allowedPoTypes = ["Normal", "FOC PO"];
  if (!allowedPoTypes.includes(poType)) {
    return next(new AppError("Invalid PO type", 400));
  }

  /* -----------------------------------------------------------
      2. Validate & clean items (FIXED LOOP)
  ----------------------------------------------------------- */
  const cleanedItems = [];

  for (const item of items) {
    if (
      !item.repairItemId ||
      !item.partNo ||
      !item.description ||
      item.description.trim() === "" ||
      !item.unit ||
      item.approveQty == null ||
      item.rate == null
    ) {
      return next(new AppError("Invalid item structure", 400));
    }

    const rate = Number(item.rate) || 0;

    if (rate < 0) {
      return next(new AppError("Rate cannot be negative", 400));
    }

    if ((item.cgst > 0 || item.sgst > 0) && item.igst > 0) {
      return next(new AppError("Cannot apply both CGST/SGST and IGST", 400));
    }

    cleanedItems.push({
      repairItemId: item.repairItemId,
      partNo: item.partNo,
      description: item.description.trim(),
      unit: item.unit,
      fromUnit: item.fromUnit || null,
      conversionValue: item.conversionValue || null,
      qtyRequired: Number(item.qtyRequired) || 0,
      approveQty: Number(item.approveQty) || 0,
      rate,
      cgst: Number(item.cgst || 0),
      sgst: Number(item.sgst || 0),
      igst: Number(item.igst || 0),
    });
  }

  /* -----------------------------------------------------------
      3. Calculate totals
  ----------------------------------------------------------- */
  let totalBaseAmount = 0;
  let totalCGSTAmount = 0;
  let totalSGSTAmount = 0;
  let totalIGSTAmount = 0;

  for (const item of cleanedItems) {
    const base = item.approveQty * item.rate;

    const cgstAmt = base * (item.cgst / 100);
    const sgstAmt = base * (item.sgst / 100);
    const igstAmt = base * (item.igst / 100);

    totalBaseAmount += base;
    totalCGSTAmount += cgstAmt;
    totalSGSTAmount += sgstAmt;
    totalIGSTAmount += igstAmt;
  }

  const totalAmount = Number(
    (totalBaseAmount + totalCGSTAmount + totalSGSTAmount + totalIGSTAmount).toFixed(2)
  );

  /* -----------------------------------------------------------
      4. Create Repair Purchase Order
  ----------------------------------------------------------- */
  const repairPO = await RepairPurchaseOrder.create({
    repairOrder,
    supplier,
    poType,
    subject,
    reference,
    termCondition,
    items: cleanedItems,
    totalAmount,
    totalCGSTAmount,
    totalSGSTAmount,
    totalIGSTAmount,
    totalItems: cleanedItems.length,
    createdBy,
    history: [{
      action: "Created",
      fromStatus: null,
      toStatus: "Generated",
      user: createdBy,
      role: req.user.role
    }]
  });

  /* -----------------------------------------------------------
      5. Update Inventory + Repair Items
  ----------------------------------------------------------- */
  const repairRequest = await RepairRequest.findById(repairOrder);

  if (!repairRequest) {
    return next(new AppError("Repair request not found", 404));
  }

  const inventoryId = repairRequest.inventory;

  const totalApproveQty = cleanedItems.reduce(
    (sum, i) => sum + i.approveQty,
    0
  );

  await Inventory.findByIdAndUpdate(inventoryId, {
    $inc: { repairQty: totalApproveQty }
  });

  await Promise.all(
    cleanedItems.map(item =>
      RepairItem.findByIdAndUpdate(item.repairItemId, {
        poStatus: "pendingForApproval",
        status: "approved",
        po: repairPO._id
      })
    )
  );

  /* -----------------------------------------------------------
      6. Auto close repair request
  ----------------------------------------------------------- */
  const remainingRepairItems = await RepairItem.find({
    repairOrder,
    poStatus: { $ne: "pendingForApproval" },
    status: "approved"
  });

  if (remainingRepairItems.length === 0) {
    await RepairRequest.findByIdAndUpdate(repairOrder, { status: "close" });
  }

  /* -----------------------------------------------------------
      7. Response
  ----------------------------------------------------------- */
  res.status(201).json({
    status: "success",
    message: "Repair Purchase Order created successfully",
    data: repairPO
  });
});

exports.repairPOByStatus = async (req, res) => {
  console.log("hhhhh",'workinggggg')
  try {
    const { query } = req.query; // e.g., ?query=Approved OR ?query=All

    const filter = {}; // base filter

    const allowedStatuses = [
      'Generated',          // Maker created or re-submitted
      'Assigned-To-Maker',  
      'Assigned-To-Checker',
      'Assigned-To-SuperAdmin',
      'Confirmed-Generated',
      'Rejected',
      'Cancelled',
      'Order-Received',
      'Partially-Received',
      'Completed',
      'All',
      'Bill-Generated',
      'start',
      'submittedToAdmin'
    ];

    // --------------------------
    // Validate & Apply filter
    // --------------------------
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
      'Confirmed-Generated',
      'Bill-Generated',
      'Rejected',
      'Cancelled',
      'Order-Received',
      'Partially-Received',
      'Completed',
      'PaymentPending'
          ]
        };
      }

      else if (query === "start") {
        filter.billingStatus = "start";
        filter.status = "Order-Received";
      }

      else if (query === "submittedToAdmin") {
        filter.billingStatus = "submittedToAdmin";
        filter.status = "Bill-Generated";
      }

      else {
        filter.status = query;
      }
    }

    // --------------------------
    // Fetch Repair Purchase Orders
    // --------------------------
    const repairPOs = await RepairPurchaseOrder.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      count: repairPOs.length,
      data: repairPOs
    });

  } catch (error) {
    console.error("Error fetching Repair POs by status:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching repair purchase orders"
    });
  }
};

// Controller to handle approval flow for Repair PO
exports.approveRepairPO = async (req, res) => {
  try {
    const { poId, action, remark } = req.body;
    const user = req.user; 
    const userRole = user.role;

    // 🔍 Fetch Repair PO
    const po = await RepairPurchaseOrder.findById(poId);
    if (!po) {
      return res.status(404).json({ message: "Repair PO not found" });
    }

    const fromStatus = po.status;
    let toStatus = fromStatus;

    /* ----------------------------------------------------
       1️⃣ Maker actions
    ---------------------------------------------------- */
    if (userRole === "pomaker") {
      if (action === "Assigned-To-Checker") {
        toStatus = "Generated";
      }
    }

    /* ----------------------------------------------------
       2️⃣ Checker actions
    ---------------------------------------------------- */
    if (userRole === "pochecker") {
      if (action === "Approved") {
        toStatus = "Assigned-To-SuperAdmin";
      } else if (action === "Reject") {
        toStatus = "Rejected";
      } else if (action === "Send-Back") {
        toStatus = "Assigned-To-Maker";
      }
    }

    /* ----------------------------------------------------
       3️⃣ // ✅ SuperAdmin + Director actions
    ---------------------------------------------------- */
    if (userRole === "superAdmin" || userRole === "director") {
      if (action === "Approved") {
        toStatus = "Confirmed-Generated";

        // ⭐ Update all RepairItem → poStatus = "generated"
        const repairItemIds = po.items.map(it => it.repairItemId).filter(Boolean);

        if (repairItemIds.length > 0) {
          await RepairItem.updateMany(
            { _id: { $in: repairItemIds } },
            { $set: { poStatus: "generated" } }
          );
        }
      } 
      else if (action === "Reject") {
        toStatus = "Rejected";
      } 
      else if (action === "Send-Back") {
        toStatus = "Assigned-To-Maker";
      }
    }

    /* ----------------------------------------------------
       4️⃣ Save updated PO status
    ---------------------------------------------------- */
    po.status = toStatus;

    /* ----------------------------------------------------
       5️⃣ Push history entry
    ---------------------------------------------------- */
    po.history.push({
      action: action === "Send-Back" ? "Sent-Back" : action,
      fromStatus,
      toStatus,
      remark: remark || "",
      user: user._id,
      role: userRole,
      date: new Date()
    });

    await po.save();

    res.json({
      status: 201,
      message: `Repair PO ${action} processed successfully`,
      po,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: "Server error approving Repair PO",
      error: err.message
    });
  }
};

// ✅ Update Repair PO Controller
exports.updateRepairPO = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { items, termCondition, supplier } = req.body;
  const user = req.user;

  const po = await RepairPurchaseOrder.findById(id).populate(
    "items.repairItemId",
    "masterlist"
  );

  if (!po) {
    return next(new AppError("Repair Purchase Order not found", 404));
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return next(new AppError("At least one item is required", 400));
  }

  let totalAmount = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;
  let changes = [];

  // -------------------------------------------------------
  // 🔥 Supplier Update
  // -------------------------------------------------------
  if (supplier && String(po.supplier) !== String(supplier)) {
    changes.push(`Supplier updated`);
    po.supplier = supplier;
  }

  // -------------------------------------------------------
  // 🔥 ITEM LOOP
  // -------------------------------------------------------
  for (const existing of po.items) {
    const updated = items.find(
      (it) => String(it.id) === String(existing._id)
    );
    if (!updated) continue;

    const oldData = existing.toObject();

    // ✅ SAFE VALUE EXTRACTION
    const description =
      updated.description !== undefined
        ? updated.description.trim()
        : existing.description;

    const qty =
      updated.approveQty !== undefined
        ? Number(updated.approveQty) || 0
        : existing.approveQty;

    const rate =
      updated.rate !== undefined
        ? Number(updated.rate) || 0
        : existing.rate;

    const cgst =
      updated.cgst !== undefined
        ? Number(updated.cgst) || 0
        : existing.cgst;

    const sgst =
      updated.sgst !== undefined
        ? Number(updated.sgst) || 0
        : existing.sgst;

    const igst =
      updated.igst !== undefined
        ? Number(updated.igst) || 0
        : existing.igst;

    // -------------------------------------------------------
    // ✅ VALIDATION
    // -------------------------------------------------------
    if (!description || description.trim() === "") {
      return next(new AppError("Description cannot be empty", 400));
    }

    if (qty < 0) {
      return next(new AppError("Approved Qty cannot be negative", 400));
    }

    if (rate < 0) {
      return next(new AppError("Rate cannot be negative", 400));
    }

    if (cgst < 0 || sgst < 0 || igst < 0) {
      return next(new AppError("GST values cannot be negative", 400));
    }

    if ((cgst > 0 || sgst > 0) && igst > 0) {
      return next(
        new AppError("Cannot apply both CGST/SGST and IGST together", 400)
      );
    }

    const master = existing?.repairItemId?.masterlist;
    const label = `PartNo ${master?.partNo || existing.partNo}`;

    // -------------------------------------------------------
    // 🔍 CHANGE TRACKING
    // -------------------------------------------------------
    if (oldData.description !== description)
      changes.push(`${label} description updated`);

    if (oldData.approveQty !== qty)
      changes.push(`${label} qty updated`);

    if (oldData.rate !== rate)
      changes.push(`${label} rate updated`);

    if (oldData.cgst !== cgst)
      changes.push(`${label} cgst updated`);

    if (oldData.sgst !== sgst)
      changes.push(`${label} sgst updated`);

    if (oldData.igst !== igst)
      changes.push(`${label} igst updated`);

    // -------------------------------------------------------
    // 🔥 APPLY UPDATE
    // -------------------------------------------------------
    existing.set({
      description,
      approveQty: qty,
      rate,
      cgst,
      sgst,
      igst,
    });

    // -------------------------------------------------------
    // 💰 CALCULATIONS
    // -------------------------------------------------------
    const base = qty * rate;
    const cgstAmt = (base * cgst) / 100;
    const sgstAmt = (base * sgst) / 100;
    const igstAmt = (base * igst) / 100;

    totalAmount += base + cgstAmt + sgstAmt + igstAmt;
    totalCGST += cgstAmt;
    totalSGST += sgstAmt;
    totalIGST += igstAmt;
  }

  po.markModified("items");

  // -------------------------------------------------------
  // 🔥 TERM CONDITIONS
  // -------------------------------------------------------
  if (Array.isArray(termCondition)) {
    const oldTerms = po.termCondition?.map(String) || [];
    const newTerms = termCondition.map(String);

    const changed =
      oldTerms.length !== newTerms.length ||
      oldTerms.some((t, i) => t.trim() !== newTerms[i]?.trim());

    if (changed) {
      changes.push(`Term Conditions updated`);
      po.termCondition = newTerms;
    }
  }

  // -------------------------------------------------------
  // 🔥 TOTALS UPDATE
  // -------------------------------------------------------
  po.totalAmount = Number(totalAmount.toFixed(2));
  po.totalCGSTAmount = Number(totalCGST.toFixed(2));
  po.totalSGSTAmount = Number(totalSGST.toFixed(2));
  po.totalIGSTAmount = Number(totalIGST.toFixed(2));
  po.totalItems = po.items.length;

  // -------------------------------------------------------
  // 🧾 HISTORY LOG
  // -------------------------------------------------------
  po.history.push({
    action: "Updated",
    fromStatus: po.status,
    toStatus: po.status,
    remark: changes.length ? changes.join(", ") : "No field changes",
    user: user._id,
    role: user.role,
    date: new Date(),
  });

  await po.save();

  res.status(200).json({
    status: "success",
    message: "Repair Purchase Order updated successfully",
    data: po,
  });
});

// old one
{ /*

  exports.AllRepairItemsByPoId = catchAsync(async (req, res, next) => {
  const { poId } = req.query;

  if (!poId) {
    return next(new AppError("PO ID is required in query", 400));
  }

  // Fetch the full PO with populated items + repairItemId → masterlist
  const repairPO = await RepairPurchaseOrder.findById(poId)
    .populate({
      path: "items.repairItemId",
      populate: {
        path: "masterlist",
        select: "partNo description unit"
      }
    });

  if (!repairPO) {
    return next(new AppError("Repair Purchase Order not found", 404));
  }

  const formatted = repairPO.items.map((it) => {
    const master = it?.repairItemId?.masterlist || {};

    return {
      id: it._id,

      // Inventory part details
      partNo: master.partNo || null,
      description: master.description || null,
      unit: master.unit || null,

      // Repair qty details
      qtyRequired: it.qtyRequired,
      approveQty: it.approveQty,

      // Pricing
      rate: it.rate,
      cgst: it.cgst,
      sgst: it.sgst,
      igst: it.igst,

      // For print table or UI
      inventoryItemId: it?.repairItemId?._id || null,
      masterlistId: master._id || null,
    };
  });

  res.status(200).json({
    success: true,
    count: formatted.length,
    data: formatted
  });
});

*/}

exports.AllRepairItemsByPoId = catchAsync(async (req, res, next) => {
  const { poId } = req.query;

  if (!poId) {
    return next(new AppError("PO ID is required in query", 400));
  }

  // ✅ Fetch REAL Repair Items linked with this PO
  const items = await RepairItem.find({ po: poId })
    .populate({
      path: "masterlist",
      select: "partNo description unit"
    })
    .populate({
      path: "repairMrv",
      select: "repairMrvNo"
    });

  if (!items || items.length === 0) {
    return res.status(200).json({
      success: true,
      count: 0,
      data: []
    });
  }

  // ✅ Format for frontend (ReceivedOrderModal)
  const formatted = items.map((item) => {
    const master = item.masterlist || {};

    return {
      _id: item._id,

      // Repair item details
      partNo: master.partNo || null,
      description: master.description || null,
      unit: master.unit || null,

      // Quantities
      approveQty: item.approveQty || 0,
      qtyRecived: item.qtyRecived || 0,
      pendingQty:
        item.flag === "remain"
          ? (item.approveQty || 0) - (item.qtyRecived || 0)
          : 0,

      // Status & MRV
      status: item.status,
      flag: item.flag,
      repairMrvNo: item.repairMrv?.repairMrvNo || null,
    };
  });

  res.status(200).json({
    success: true,
    count: formatted.length,
    data: formatted
  });
});










