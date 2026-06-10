const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sharp = require("sharp");
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const PaymentWorkflow = require("../models/paymentWorkflowModel");
const PurchaseOrder = require("../models/PurchaseOrder");
const mongoose = require("mongoose");


// ===============================
// ✅ FOLDER SETUP
// ===============================
const billingDir = path.join(__dirname, "../public/img/billing");
const tempDir = path.join(__dirname, "../public/img/temp");

[billingDir, tempDir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ===============================
// ✅ MULTER STORAGE (TEMP)
// ===============================
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const ext = file.mimetype.split("/")[1];
    cb(null, `temp-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`);
  },
});

// ===============================
// ✅ FILE FILTER (IMAGE + PDF)
// ===============================
const multerFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith("image") ||
    file.mimetype === "application/pdf"
  ) {
    cb(null, true);
  } else {
    cb(new AppError("Only Image or PDF allowed!", 400), false);
  }
};

// ===============================
// ✅ MULTER INSTANCE
// ===============================
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

// ===============================
// ✅ EXPORT UPLOAD
// ===============================
exports.uploadBillingDocs = upload.fields([
  { name: "otherDocument", maxCount: 1 },
  { name: "creditNote", maxCount: 1 },
]);

// ===============================
// ✅ SAFE DELETE
// ===============================
const deleteFileSafe = (filePath) => {
  if (!filePath) return;

  const tryDelete = (retry = 0) => {
    if (!fs.existsSync(filePath)) return;

    fs.unlink(filePath, (err) => {
      if (!err) return;

      if ((err.code === "EPERM" || err.code === "EBUSY") && retry < 5) {
        return setTimeout(() => tryDelete(retry + 1), 1000);
      }

      console.error("Delete failed:", err.message);
    });
  };

  tryDelete();
};

// ===============================
// ✅ PROCESS FILES
// ===============================
exports.processBillingDocs = async (req, res, next) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return next();
    }

    const processFile = async (file) => {
      const tempPath = file.path;
      const isImage = file.mimetype.startsWith("image");

      const filename = `billing-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}${isImage ? ".jpeg" : ".pdf"}`;

      const outputPath = path.join(billingDir, filename);

      if (isImage) {
        // ✅ compress image
        await sharp(tempPath)
          .resize({ width: 800 })
          .jpeg({ quality: 60 })
          .toFile(outputPath);

        deleteFileSafe(tempPath);
      } else {
        // ✅ move PDF (BEST WAY)
        fs.renameSync(tempPath, outputPath);
      }

      return filename;
    };

    // ✅ other document
    if (req.files.otherDocument) {
      req.body.otherDocument = await processFile(
        req.files.otherDocument[0]
      );
    }

    // ✅ credit note
    if (req.files.creditNote) {
      req.body.creditNoteFile = await processFile(
        req.files.creditNote[0]
      );
    }

    next();
  } catch (err) {
    console.error("PROCESS ERROR:", err);
    next(new AppError("File processing failed", 400));
  }
};

// ===============================
// ✅ BILLING APPROVE
// ===============================
exports.billingApprove = async (req, res) => {
  console.log("billing user approval", req.user);

  try {

    const {
      poId,
      mrvIds,
      supplierId,
      totalPoAmount,
      totalBillAmount,
      totalOtherCharges,
      approvedAmount,
      creditNoteAmount,
      remarks,
    } = req.body;

    // ✅ BASIC VALIDATION
    if (!poId || !supplierId) {
      return res.status(400).json({
        status: "fail",
        message: "poId and supplierId are required",
      });
    }

    // ✅ PARSE MRV IDS
    let parsedMrvIds = [];

    try {

      parsedMrvIds =
        typeof mrvIds === "string"
          ? JSON.parse(mrvIds)
          : mrvIds;

    } catch {

      parsedMrvIds = [];

    }

    // ✅ FILES FROM PROCESS
    const otherDocument = req.body.otherDocument || null;
    const creditNoteFile = req.body.creditNoteFile || null;

    // ✅ SAFE USER
    const userId = req.user?._id || null;

    const doc = await PaymentWorkflow.create({

      po: poId,

      mrvIds: parsedMrvIds,

      supplier: supplierId,

      // ✅ FORCE NUMBER
      totalPoAmount: Number(totalPoAmount) || 0,

      totalBillAmount: Number(totalBillAmount) || 0,

      totalOtherCharges: Number(totalOtherCharges) || 0,

      approvedAmount: Number(approvedAmount) || 0,

      creditNote: {
        isApplied: !!creditNoteAmount,
        file: creditNoteFile,
        amount: Number(creditNoteAmount) || 0,
      },

      otherDocument,

      // =========================
      // BILLING APPROVAL
      // =========================
      billingApproval: {
        approvedBy: userId,
        remarks,
        approvedAt: new Date(),
      },

      // =========================
      // NEW PO APPROVAL STEP
      // =========================
      poApproval: {
        status: "Pending",
        approvedBy: null,
        remarks: null,
        approvedAt: null,
      },

      // =========================
      // NEXT STAGE AFTER BILLING
      // =========================
      status: "PO Pending",

      history: [
        {
          action: "Approved By Billing Team",
          by: userId,
          role: req.user?.role || "billing",
          remarks,
          date: new Date(),
        },
      ],
    });

    // ✅ UPDATE PO STATUS
    await PurchaseOrder.findByIdAndUpdate(
      poId,
      {
        status: "In-Process",
      }
    );

    res.status(201).json({
      status: "success",
      data: doc,
    });

  } catch (error) {

    console.error("Billing Approve Error 👉", error);

    res.status(500).json({
      status: "error",
      message: "Billing approval failed",
    });

  }
};

exports.poSendBack = async (req, res) => {
  try {

    const { id } = req.params;
    const { ids, remarks } = req.body;

    // ✅ VALIDATION
    if (!id && (!ids || ids.length === 0)) {
      return res.status(400).json({
        status: "fail",
        message: "Provide id or ids"
      });
    }

    const filter = id
      ? { _id: id }
      : { _id: { $in: ids } };

    const update = {

      status: "Sent Back to Billing",

      poApproval: {
        status: "Sent Back",
        approvedBy: req.user._id,
        remarks,
        approvedAt: new Date()
      },

      $push: {
        history: {
          action: "Sent Back to Billing Team By PO",
          by: req.user._id,
          role: "po",
          remarks,
          date: new Date()
        }
      }
    };

    const result = await PaymentWorkflow.updateMany(
      filter,
      update
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        status: "fail",
        message: "No records updated"
      });
    }

    // make PO visible to billing again
    const updatedDocs = await PaymentWorkflow.find(filter)
      .select("po");

    const poIds = updatedDocs
      .map(doc => doc.po)
      .filter(Boolean);

    if (poIds.length > 0) {

      await PurchaseOrder.updateMany(
        { _id: { $in: poIds } },
        {
          status: "Order-Received"
        }
      );

    }

    res.status(200).json({
      status: "success",
      message: "PO Send Back Done",
      updatedPOs: poIds.length,
      data: result
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      status: "error",
      message: "PO Send Back Failed"
    });

  }
};


exports.poApprove = async (req, res) => {
  try {

    const { id } = req.params;
    const { ids, remarks } = req.body;

    // ✅ VALIDATION
    if (!id && (!ids || ids.length === 0)) {
      return res.status(400).json({
        status: "fail",
        message: "Provide id or ids"
      });
    }

    const filter = id
      ? { _id: id }
      : { _id: { $in: ids } };

    const update = {

      status: "HO Pending",

      poApproval: {
        status: "Approved",
        approvedBy: req.user._id,
        remarks,
        approvedAt: new Date()
      },

      $push: {
        history: {
          action: "Approved By PO Team",
          by: req.user._id,
          role: "po",
          remarks,
          date: new Date()
        }
      }
    };

    const result = await PaymentWorkflow.updateMany(
      filter,
      update
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({
        status: "fail",
        message: "No records updated"
      });
    }

    res.status(200).json({
      status: "success",
      message: "PO Approval Done",
      data: result
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      status: "error",
      message: "PO Approval Failed"
    });

  }
};


// ✅ HO SEND BACK
exports.hoSendBack = async (req, res) => {
  try {

    const { id } = req.params;
    const { ids, remarks, sendBackTo = "billing" } = req.body;

    // ✅ VALIDATION
    if (!id && (!ids || ids.length === 0)) {
      return res.status(400).json({
        status: "fail",
        message: "Provide id or ids"
      });
    }

    // ✅ VALIDATION
    if (!["billing", "po"].includes(sendBackTo)) {
      return res.status(400).json({
        status: "fail",
        message: "sendBackTo must be billing or po"
      });
    }

    // ✅ FILTER USING PAYMENT WORKFLOW _id
    const filter = id
      ? { _id: id }
      : { _id: { $in: ids } };

    let update = {};

    // ==================================================
    // SEND BACK TO BILLING
    // ==================================================
    if (sendBackTo === "billing") {

      update = {

        status: "Sent Back to Billing",

        hoApproval: {
          status: "Sent Back",
          approvedBy: req.user._id,
          remarks,
          approvedAt: new Date()
        },

        $push: {
          history: {
            action: "Sent Back to Billing Team By HO",
            by: req.user._id,
            role: req.user?.role || "director",
            remarks,
            date: new Date()
          }
        }
      };

    }

    // ==================================================
    // SEND BACK TO PO
    // ==================================================
    if (sendBackTo === "po") {

      update = {

        status: "PO Pending",

        hoApproval: {
          status: "Sent Back",
          approvedBy: req.user._id,
          remarks,
          approvedAt: new Date()
        },

        poApproval: {
          status: "Pending",
          approvedBy: null,
          remarks: null,
          approvedAt: null
        },

        $push: {
          history: {
            action: "Sent Back To PO Team By HO",
            by: req.user._id,
            role: req.user?.role || "director",
            remarks,
            date: new Date()
          }
        }
      };

    }

    // ✅ STEP 1 — UPDATE PAYMENT WORKFLOW
    const result = await PaymentWorkflow.updateMany(
      filter,
      update
    );

    // ✅ NO UPDATE
    if (result.modifiedCount === 0) {
      return res.status(404).json({
        status: "fail",
        message: "No records updated"
      });
    }

    // ✅ STEP 2 — FETCH RELATED PO IDs
    const updatedDocs = await PaymentWorkflow.find(filter)
      .select("po");

    const poIds = updatedDocs
      .map(doc => doc.po)
      .filter(Boolean);

    // ==================================================
    // ONLY RESET PO STATUS IF SENT BACK TO BILLING
    // ==================================================
    if (
      sendBackTo === "billing" &&
      poIds.length > 0
    ) {

      await PurchaseOrder.updateMany(
        { _id: { $in: poIds } },
        {
          status: "Order-Received"
        }
      );

    }

    // ✅ RESPONSE
    res.status(200).json({
      status: "success",
      message: `HO Send Back To ${sendBackTo.toUpperCase()} Done`,
      updatedPOs: poIds.length,
      data: result
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      status: "error",
      message: "HO Send Back failed"
    });

  }
};


// ✅ HO APPROVE
exports.hoApprove = async (req, res) => {
  try {

    const { id } = req.params;
    const { ids, remarks } = req.body;

    // ✅ VALIDATION
    if (!id && (!ids || ids.length === 0)) {
      return res.status(400).json({
        status: "fail",
        message: "Provide id or ids"
      });
    }

    // ✅ FILTER USING PAYMENT WORKFLOW _id
    const filter = id
      ? { _id: id }
      : { _id: { $in: ids } };

    // ✅ UPDATE OBJECT
    const update = {

      status: "Accounts Pending",

      hoApproval: {
        status: "Approved",
        approvedBy: req.user._id,
        remarks,
        approvedAt: new Date()
      },

      // ✅ HISTORY
      $push: {
        history: {
          action: "Approved By HO",
          by: req.user._id,
          role: req.user?.role || "director",
          remarks,
          date: new Date()
        }
      }
    };

    // ✅ UPDATE PAYMENT WORKFLOW
    const result = await PaymentWorkflow.updateMany(
      filter,
      update
    );

    // ✅ NO UPDATE
    if (result.modifiedCount === 0) {
      return res.status(404).json({
        status: "fail",
        message: "No records updated"
      });
    }

    // ✅ RESPONSE
    res.status(200).json({
      status: "success",
      message: "HO Approval Done",
      data: result
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      status: "error",
      message: "HO Approval failed"
    });

  }
};


// ✅ ACCOUNTS PAYMENT
exports.markPaymentPaid = catchAsync(async (req, res, next) => {

  const {
    paymentWorkflowId,
    paidAmount,
    paymentDate,
    paymentMode,
    transactionId,
    remarks
  } = req.body;

  const workflow = await PaymentWorkflow.findById(
    paymentWorkflowId
  );

  if (!workflow) {
    return next(
      new AppError("Payment workflow not found", 404)
    );
  }

  // ======================
  // PAYMENT WORKFLOW
  // ======================

  workflow.accountsApproval = {
    ...workflow.accountsApproval,

    status: "Paid",

    paidAmount,

    paymentDate,

    paymentMode,

    transactionId,

    remarks,

    approvedBy: req.user._id
  };

  workflow.status = "Paid";

  workflow.history.push({
    action: "Paid",
    by: req.user._id,
    role: "accounts",
    remarks
  });

  await workflow.save();

  // ======================
  // CLOSE PO
  // ======================

  await PurchaseOrder.findByIdAndUpdate(
    workflow.po,
    {
      status: "Completed"
    }
  );

  res.status(200).json({
    status: "success",
    message: "Payment completed successfully"
  });

});


// ✅ ACCOUNTS SEND BACK
exports.accountsSendBack = catchAsync(async (req, res, next) => {

  const {
    paymentWorkflowId,
    remarks
  } = req.body;

  if (!remarks || !remarks.trim()) {
    return next(
      new AppError(
        "Remarks required",
        400
      )
    );
  }

  const workflow = await PaymentWorkflow.findById(
    paymentWorkflowId
  );

  if (!workflow) {
    return next(
      new AppError(
        "Payment workflow not found",
        404
      )
    );
  }

  workflow.accountsApproval.status =
    "Sent Back";

  workflow.accountsApproval.remarks =
    remarks;

  workflow.accountsApproval.approvedBy =
    req.user._id;

  workflow.status =
    "Sent Back by Accounts";

  workflow.history.push({
    action: "Sent Back",
    by: req.user._id,
    role: "accounts",
    remarks
  });

  await workflow.save();

  res.status(200).json({
    status: "success",
    message: "Sent back to billing team"
  });

});

//billingupdate of flow 


exports.updateBillingDetails = async (req, res) => {
  try {
    const {
      poId,
      totalBillAmount,
      totalOtherCharges,
      approvedAmount,
      creditAmount,
      remarks
    } = req.body;

    // =========================
    // ❗ VALIDATION
    // =========================
    if (!poId) {
      return res.status(400).json({
        status: "fail",
        message: "PO ID is required"
      });
    }

    const finalRemark = remarks?.trim();

    if (!finalRemark) {
      return res.status(400).json({
        status: "fail",
        message: "Remarks is required"
      });
    }

    // =========================
    // 🔥 FIND WORKFLOW
    // =========================
    const workflow = await PaymentWorkflow.findOne({ po: poId });

    if (!workflow) {
      return res.status(404).json({
        status: "fail",
        message: "Payment workflow not found"
      });
    }

    // =========================
    // 🔥 FIND PURCHASE ORDER
    // =========================
    const purchaseOrder = await PurchaseOrder.findById(poId);

    if (!purchaseOrder) {
      return res.status(404).json({
        status: "fail",
        message: "Purchase Order not found"
      });
    }

    // =========================
    // ✅ UPDATE AMOUNTS
    // =========================

    if (totalBillAmount !== undefined) {
      workflow.totalBillAmount = Number(totalBillAmount);
    }

    if (totalOtherCharges !== undefined) {
      workflow.totalOtherCharges = Number(totalOtherCharges);
    }

    if (approvedAmount !== undefined) {
      if (Number(approvedAmount) < 0) {
        return res.status(400).json({
          status: "fail",
          message: "Approved amount cannot be negative"
        });
      }

      workflow.approvedAmount = Number(approvedAmount);
    }

    // =========================
    // 🔥 CREDIT NOTE UPDATE
    // =========================

    if (creditAmount !== undefined) {
      workflow.creditNote = workflow.creditNote || {};

      workflow.creditNote.amount = Number(creditAmount);
      workflow.creditNote.isApplied = true;
    }

    // =========================
    // 🔥 BILLING DETAILS SYNC
    // =========================

    workflow.billingDetails = workflow.billingDetails || {};

    workflow.billingDetails.totalBillAmount =
      workflow.totalBillAmount;

    workflow.billingDetails.totalOtherCharges =
      workflow.totalOtherCharges;

    workflow.billingDetails.approvedAmount =
      workflow.approvedAmount;

    workflow.billingDetails.creditAmount =
      workflow.creditNote?.amount || 0;

    workflow.billingDetails.remarks =
      finalRemark;

    // =========================
    // 🔥 BILLING APPROVAL UPDATE
    // =========================

    workflow.billingApproval =
      workflow.billingApproval || {};

    workflow.billingApproval.remarks =
      finalRemark;

    workflow.billingApproval.approvedBy =
      req.user?._id;

    workflow.billingApproval.approvedAt =
      new Date();
    // =========================
    // 🔥 SEND TO PO TEAM
    // =========================

    workflow.status = "PO Pending";

    // Reset PO approval because approval cycle starts again
    workflow.poApproval = {
      status: "Pending",
      approvedBy: null,
      remarks: "",
      approvedAt: null
    };

    // Reset HO approval because approval cycle starts again
    workflow.hoApproval = {
      status: "Pending",
      approvedBy: null,
      remarks: "",
      approvedAt: null
    };

    // =========================
    // 🔥 RESET ACCOUNTS APPROVAL
    // =========================

    if (workflow.accountsApproval) {
      workflow.accountsApproval.status = "Pending";
      workflow.accountsApproval.approvedBy = null;
      workflow.accountsApproval.remarks = "";
      workflow.accountsApproval.paymentDate = null;
      workflow.accountsApproval.paymentMode = "";
      workflow.accountsApproval.transactionId = "";
    }

    // =========================
    // 🔥 UPDATE PURCHASE ORDER STATUS
    // =========================

    purchaseOrder.status = "In-Progress";

    // =========================
    // 🔥 HISTORY
    // =========================

    workflow.history.push({
      action: "Billing Updated & Sent To PO Team",
      by: req.user?._id,
      role: "billing",
      remarks: finalRemark,
      date: new Date()
    });

    // =========================
    // ✅ SAVE BOTH
    // =========================

    await workflow.save();
    await purchaseOrder.save();

    return res.status(200).json({
      status: "success",
      message: "Billing details updated and sent to PO Team successfully",
      data: workflow
    });

  } catch (error) {

    console.error("Billing Update Error:", error);

    return res.status(500).json({
      status: "error",
      message: "Something went wrong"
    });

  }
};


exports.getBillingHistory = async (req, res) => {
  try {
    const { poId } = req.params;

    if (!poId) {
      return res.status(400).json({
        status: "fail",
        message: "PO ID is required"
      });
    }

    const data = await PaymentWorkflow.aggregate([
      {
        $match: {
          po: new mongoose.Types.ObjectId(poId)
        }
      },

      // 🔥 UNWIND HISTORY ARRAY
      {
        $unwind: {
          path: "$history",
          preserveNullAndEmptyArrays: true
        }
      },

      // 🔥 USER LOOKUP
      {
        $lookup: {
          from: "users",
          localField: "history.by",
          foreignField: "_id",
          as: "userData"
        }
      },

      {
        $unwind: {
          path: "$userData",
          preserveNullAndEmptyArrays: true
        }
      },

      // 🔥 FINAL STRUCTURE
      {
        $project: {
          _id: 0,

          action: "$history.action",
          role: "$history.role",   // ✅ ADD THIS
          remarks: "$history.remarks",
          date: "$history.date",

          userId: "$userData._id",
          userName: "$userData.name",
          userEmail: "$userData.email"
        }
      },

      // 🔥 LATEST FIRST
      {
        $sort: { date: -1 }
      }
    ]);

    return res.status(200).json({
      status: "success",
      results: data.length,
      data
    });

  } catch (error) {
    console.error("Get Billing History Error:", error);

    return res.status(500).json({
      status: "error",
      message: "Something went wrong"
    });
  }
};