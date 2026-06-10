
const { generateReport } = require("../utils/reportBuilder");
const Transfer = require('../models/transferModel');
const factory = require('./handlerFactory');
const catchAsync = require('../utils/catchAsync');
const User = require('../models/userModel');
const Inventory = require('../models/inventoryModel');
const TransferItem = require('../models/transferItemModel');

const AppError = require('../utils/appError');
const multer = require('multer');
const sharp = require('sharp');
const fs = require('fs');
const transferItem = require('../models/transferItemModel');
const Mrv = require('../models/mrvFormModel');
//const XLSX = require("xlsx");

const path = require('path');

const formatDate = (date) =>
  date ? new Date(date).toISOString().split("T")[0] : "";


// ✅ 1. Use memory storage (no original file saved to disk)
const multerStorage = multer.memoryStorage();

// ✅ 2. Accept only image files
const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    console.log(file); // Optional: log for debugging
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

// ✅ 3. Initialize multer upload instance
const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

// ✅ 4. Export middleware to handle file upload
exports.uploadProductPhoto = upload.single('image');

// ✅ 5. Resize image and save to `requisitionform` folder
exports.resizeProductPhoto = catchAsync(async (req, res, next) => {
  if (!req.file) return next(); // No file uploaded

  const filename = `product-${Date.now()}.jpeg`; // Final filename
  const outputDir = path.join(__dirname, '../public/img/requisitionform');
  const outputPath = path.join(outputDir, filename);

  // ✅ Ensure folder exists (in case it's missing)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // ✅ Resize & save image
  await sharp(req.file.buffer)
    .resize({ width: 800 }) // Optional: you can adjust size
    .toFormat('jpeg')
    .jpeg({ quality: 90 }) // Use 90 for better quality (like your original)
    .toFile(outputPath);

  req.body.fileName = filename; // Set filename for controller use

  next(); // Proceed to next middleware/controller
});


exports.createItem = catchAsync(async (req, res, next) => {

  console.log('req', req.body)
  const inventory = await Inventory.findById(req.body.inventory);

  if (req.body.status) {
    return next(new AppError('This route is not for Status Change !'))
  }
  if (req.body.transferQty > inventory.currentStock) {
    console.log("check1")
    return next(new AppError('Transfer Qty should be less then Current Stock'))
  }
  req.body.user = req.user._id;
  req.body.transfer = req.body.transfer;

  const doc = await TransferItem.create(req.body);
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





exports.getAllRecivedItem = catchAsync(async (req, res, next) => {

  const user = req.user;
  console.log("user 2", user)
  let filter = {};


  filter = {
    to: req.query.query,
    status: req.query.status
  }

  console.log("filter", filter)
  const doc = await TransferItem.find(filter)
  console.log(doc)
  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
})

exports.getAllItem = catchAsync(async (req, res, next) => {

  const user = req.user;
  console.log("user 2", user)
  let filter = {};


  filter = {
    from: req.query.query,
    status: req.query.status,
    transfer: req.query.transfer
  }

  console.log("filter", filter)
  const doc = await TransferItem.find(filter)
  console.log(doc)
  res.status(201).json({
    status: 'success',
    data: {
      data: doc
    }
  });
})
exports.getInventoryItem = factory.getAll(TransferItem);

exports.updateRequestItem = catchAsync(async (req, res, next) => {

  const { approveQty, status } = req.body;

  const doc = await TransferItem.findById(req.params.id).populate("inventory transfer");

  if (!doc) {
    return next(new AppError('No item found with that ID', 404));
  }

  // ===============================
  // APPROVE FLOW
  // ===============================
  if (status === "approved") {

    // Atomic stock check + update (NO RACE CONDITION)
    const inventory = await Inventory.findOneAndUpdate(
      {
        _id: doc.inventory._id,
        currentStock: { $gte: approveQty }   // only update if enough stock
      },
      {
        $inc: {
          currentStock: -approveQty,
          transitionQty: approveQty
        }
      },
      { new: true }
    );

    if (!inventory) {
      return next(
        new AppError(
          `Insufficient stock. Available: ${doc.inventory.currentStock}`,
          400
        )
      );
    }
  }

  // ===============================
  // UPDATE TRANSFER ITEM
  // ===============================
  const updatedItem = await TransferItem.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  );

  // ===============================
  // CLOSE TRANSFER IF ALL DONE
  // ===============================
  if (status === "approved" || status === "rejected") {

    const pendingCount = await TransferItem.countDocuments({
      transfer: updatedItem.transfer._id,
      status: "pending"
    });

    if (pendingCount === 0) {
      await Transfer.findByIdAndUpdate(
        updatedItem.transfer._id,
        { status: "close" }
      );
    }
  }

  res.status(200).json({
    status: "success",
    data: updatedItem
  });
});

{/*
exports.updateRequestItemold = catchAsync(async (req, res, next) => {
  // Prepare the update body based on user role
  let body = req.body;

  // Update the item first
  //const doc = await TransferItem.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });

  let doc = await TransferItem.findById(req.params.id)


  const inventory = await Inventory.find({})
  if (!doc) {
    return next(new AppError('No item found with that ID', 404));
  }


  if (req.body.status === 'approved') {

    console.log("gg",doc.inventory.currentStock)
    console.log("TT", req.body.approveQty)
   

    if ((doc.inventory.currentStock < req.body.approveQty) ) {
      console.log("enter","hh")
      return next(new AppError(`Your Inventery Has ${doc.inventory.currentStock} stock And you want to approve ${req.body.approveQty} stock`, 404));
    }

    const remain = doc.inventory.currentStock - req.body.approveQty;

    if (remain < 0) {
      return next(new AppError(`There is some problem please check with doveloper !`, 404));
    }
    //old one before 14-agust 2025
    //const inventory = await Inventory.findByIdAndUpdate(doc.inventory._id, { currentStock: remain })
    //before 14-august

     // Update currentStock AND increment transitionQty in one go
  const inventory = await Inventory.findByIdAndUpdate(
    doc.inventory._id,
    {
      $set: { currentStock: remain },
      $inc: { transitionQty: req.body.approveQty }
    }
  );
  }
  doc = await TransferItem.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });

  
  // Check if qtyUsed and status are present and status is 'approved'
  if (req.body.status === 'approved' || req.body.status === 'rejected') {
    const item = await TransferItem.find({ transfer: doc.transfer._id, status: "pending" })
    console.log('check2', item)
    if (item.length === 0) {

      const tra = await Transfer.findByIdAndUpdate(doc.transfer._id, { status: 'close' })
      console.log(tra)
    }

  }

  // Send the response
  res.status(200).json({
    status: 'success',
    data: {
      item: doc,
    },
  });
});

*/}

// Controller to fetch items based on storeId, status, and date range
exports.getItemsByStoreStatusDate = async (req, res, next) => {
  try {
    const { fromDate, toDate, status, page = 1, limit = 200 } = req.body;

    const from = fromDate ? new Date(fromDate) : new Date(0);
    const to = toDate ? new Date(toDate) : new Date();

    if (isNaN(from) || isNaN(to)) {
      return next(new AppError('Invalid Date Format', 400));
    }

    from.setHours(0, 0, 0, 0);
    to.setHours(23, 59, 59, 999);

    const query = {
      createdAt: { $gte: from, $lte: to }
    };

    if (status && status !== "all") {
      query.status = status;
    }

    const skip = (page - 1) * limit;

    const [items, totalCount] = await Promise.all([

      TransferItem.find(query)
        .select("transfer inventory mrv status createdAt updatedAt transferQty recived approveQty")

        // ✅ REQUIRED POPULATE ONLY (LIGHTWEIGHT)
        .populate({
          path: "transfer",
          select: "transferNo storeFrom storeTo",
          populate: [
            { path: "storeFrom", select: "name" },
            { path: "storeTo", select: "name" }
          ]
        })
        .populate({
          path: "inventory",
          select: "qtyAuth currentStock masterItem",
          populate: {
            path: "masterItem",
            select: "partNo description unit",
            populate: {
              path: "unit",
              select: "name"
            }
          }
        })
        .populate({
          path: "mrv",
          select: "mrvNo"
        })

        .lean()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),

      TransferItem.countDocuments(query)

    ]);
    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      status: 'success',
      data: items,
      count: totalCount,
      page,
      limit,
      totalPages   // ✅ ADD THIS
    });

  } catch (error) {
    console.error('Error fetching items:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Error fetching items'
    });
  }
};



exports.downloadTransferReport = async (req, res) => {
  const { fromDate, toDate, status } = req.body;

  const fileName = "Transfer_Report.xlsx"; // ✅ single source

  const from = fromDate ? new Date(fromDate) : new Date(0);
  const to = toDate ? new Date(toDate) : new Date();

  // ✅ Better date validation
  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    return generateReport({
      model: TransferItem,
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

  const query = {
    createdAt: { $gte: from, $lte: to },
  };

  if (status && status !== "all") {
    query.status = status;
  }

  return generateReport({
    model: TransferItem,
    query,

    select:
      "transfer inventory mrv status createdAt updatedAt transferQty recived approveQty damageQty",

    populate: [
      {
        path: "transfer",
        select: "transferNo storeFrom storeTo",
        populate: [
          { path: "storeFrom", select: "name" },
          { path: "storeTo", select: "name" },
        ],
      },
      {
        path: "inventory",
        select: "qtyAuth currentStock masterItem",
        populate: {
          path: "masterItem",
          select: "partNo description unit",
          populate: { path: "unit", select: "name" },
        },
      },
      { path: "mrv", select: "mrvNo" },
    ],

    fileName,

    mapFunction: (item, index) => ({
      "S.No": index + 1,
      "From-Store": item?.transfer?.storeFrom?.name || "",
      "To-Store": item?.transfer?.storeTo?.name || "",
      "Date": formatDate(item?.createdAt),
      "Transfer No": item?.transfer?.transferNo || "",
      "Part No": item?.inventory?.masterItem?.partNo || "",
      "Description": item?.inventory?.masterItem?.description || "",
      "Unit": item?.inventory?.masterItem?.unit?.name || "",
      "Auth": item?.inventory?.qtyAuth || 0,
      "Required Qty": item?.transferQty || 0,
      "Current Stock": item?.inventory?.currentStock || 0,
      "Approved Qty": item?.approveQty || 0,
      "Received Qty": item?.recived || 0,
      "Damage Qty": item?.damageQty || 0,
      "Status": item?.status || "",
      "MTR NO": item?.mrv?.mrvNo || "",
    }),

    res,
  });
};


exports.deleteInventroyItem = factory.deleteOne(Request);
