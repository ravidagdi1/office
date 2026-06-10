const mongoose = require("mongoose");  // ✅ add this
const sharp = require('sharp');
const path = require('path'); // <-- Add this
const fs = require('fs');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const factory = require('./handlerFactory');
const BillingDepart = require('../models/billingDeptModel'); // your schema file
const PO = require('../models/PurchaseOrder'); // your schema file
const multer = require('multer')

// Use memory storage (buffer only, not written to disk)
const multerStorage = multer.memoryStorage();

// Accept images and PDFs
const multerFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith('image') || 
    file.mimetype === 'application/pdf'
  ) {
    cb(null, true);
  } else {
    cb(new AppError('Only images and PDFs are allowed!', 400), false);
  }
};

// Setup multer with memory storage and filter
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

// Middleware to handle upload (key: image)
exports.uploadProductPhoto = upload.single('image');

// Middleware to resize image or save PDF
exports.resizeProductPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(); // Skip if no file uploaded

  let filename;
  const outputDir = path.join(__dirname, '../public/img/billing');

  // Create directory if not exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (req.file.mimetype.startsWith('image')) {
    // Process image with sharp
    filename = `billing-${Date.now()}.jpeg`;
    const outputPath = path.join(outputDir, filename);

    await sharp(req.file.buffer)
      .resize({ width: 800 }) // Resize to 800px width
      .toFormat('jpeg')
      .jpeg({ quality: 70, mozjpeg: true, progressive: true })
      .toFile(outputPath);
  } else if (req.file.mimetype === 'application/pdf') {
    // Save PDF directly
    filename = `billing-${Date.now()}.pdf`;
    const outputPath = path.join(outputDir, filename);

    await fs.promises.writeFile(outputPath, req.file.buffer);
  }

  req.body.fileName = filename; // Store filename in req.body for controller
  next();
});


// Create Billing Record
exports.createBillingRecord = catchAsync(async (req, res, next) => {
  let {
    po,
    mrvIds,
    totalOtherCharges,
    totalBillAmount,
    approvedAmount,
    remarks,
    status,
  } = req.body;

  // Convert MRV IDs (string → array)
  if (typeof mrvIds === "string") {
    mrvIds = mrvIds.split(",").map(id => id.trim()).filter(Boolean);
  }

  // Parse numeric fields
  totalOtherCharges = parseFloat(totalOtherCharges);
  totalBillAmount = parseFloat(totalBillAmount);
  approvedAmount = parseFloat(approvedAmount || 0);

  // Basic validations
  if (!po) return next(new AppError("PO ID is required", 400));
  if (!Array.isArray(mrvIds) || mrvIds.length === 0)
    return next(new AppError("At least one MRV ID is required", 400));

  if (isNaN(totalOtherCharges))
    return next(new AppError("Total other charges are required", 400));

  if (isNaN(totalBillAmount))
    return next(new AppError("Total bill amount is required", 400));

  if (!status) return next(new AppError("Status is required", 400));

  // Validate MRV ObjectIds
  const validMrvIds = [];
  for (const id of mrvIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new AppError(`Invalid MRV ID: ${id}`, 400));
    }
    if (!validMrvIds.includes(id)) validMrvIds.push(id);
  }

  // Handle uploaded file (Sharp or multer)
  let otherDoc = req.body.fileName || null;

  // 1️⃣ Create BillingDepart record (WITHOUT po)
  const billingRecord = await BillingDepart.create({
    mrvIds: validMrvIds,
    totalOtherCharges,
    totalBillAmount,
    approvedAmount,
    status,
    createdBy: req.user._id,
    remarks: remarks || "",
    otherDoc,
  });

  // 2️⃣ Update PurchaseOrder (link billing record)
  const poUpdate = {
    billing: billingRecord._id,   // store billing ID here
    status: "Bill-Generated",
    billingStatus: "submittedToAdmin",
    $push: {
      history: {
        action: "Billing Record Created",
        fromStatus: "",
        toStatus: "Bill-Generated",
        remark: remarks || "",
        user: req.user._id,
        role: req.user.role,
        date: new Date(),
      }
    }
  };

  const updatedPO = await PO.findByIdAndUpdate(po, poUpdate, { new: true });

  if (!updatedPO)
    return next(new AppError("Purchase Order not found", 404));

  // Response
  res.status(201).json({
    status: "success",
    message: "Billing record created and linked to PO successfully",
    data: {
      billing: billingRecord,
      po: updatedPO
    }
  });
});





exports.getBillingDetailsWithPO = catchAsync(async (req, res, next) => {
  const { status } = req.params; // ✅ frontend sends /api/v1/billing/:status

  const filter = {};
  if (status && status !== "All") {
    filter.status = status;
  }

  // Fetch billing records based on filter
  const billings = await BillingDepart.find(filter).sort({ createdAt: -1 });

  if (!billings || billings.length === 0) {
    return next(
      new AppError(`No billing records found for status: ${status}`, 404)
    );
  }

  res.status(200).json({
    status: "success",
    results: billings.length,
    data: billings, // already populated via schema pre-find
  });
});


exports.billingApproval = catchAsync(async (req, res, next) => {
  const { id } = req.params;        // BillingDepart ID
  const { action, status, remark } = req.body; // action = approve/reject/sendBack

  // Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return next(new AppError("Invalid billing ID", 400));
  }

  // Validate action
  const allowedActions = ["approve", "reject", "sendBack"];
  if (!allowedActions.includes(action)) {
    return next(new AppError("Invalid action", 400));
  }

  // Fetch billing
  const billing = await BillingDepart.findById(id);
  if (!billing) {
    return next(new AppError("Billing record not found", 404));
  }

  // Role check for approve
  if (action === "approve" && req.user.role !== "superAdmin") {
    return next(new AppError("Only superAdmin can approve", 403));
  }

  // Update BillingDept status
  billing.status = status || billing.status;
  await billing.save();

  // Update PO's billingStatus and push history
  const poUpdate = {
    billingStatus: status || billing.status,
    $push: {
      history: {
        action: action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Sent-Back",
        fromStatus: billing.status,
        toStatus: status || billing.status,
        remark: remark || "",
        user: req.user._id,
        role: req.user.role,
        date: new Date()
      }
    }
  };

  const updatedPO = await PO.findByIdAndUpdate(billing.po, poUpdate, { new: true });

  res.status(200).json({
    status: "success",
    data: {
      billing,
      po: updatedPO
    },
  });
});

exports.getBillingDetailsByPoId = catchAsync(async (req, res, next) => {
  const poId = req.params.id;

  // Validate ObjectId only
  if (!mongoose.Types.ObjectId.isValid(poId)) {
    return next(new AppError("Invalid PO ID format", 400));
  }

  // Fetch billing data
  const billing = await BillingDepart.findOne({ po: poId });

  // ❗ DO NOT throw error if billing === null  
  // Frontend will handle empty state

  res.status(200).json({
    status: "success",
    data: billing ? billing : null
  });
});
















